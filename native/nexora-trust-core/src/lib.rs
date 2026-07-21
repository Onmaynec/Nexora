use std::collections::BTreeMap;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use openmls::{
    credentials::{BasicCredential, CredentialWithKey},
    framing::{MlsMessageBodyIn, MlsMessageIn, MlsMessageOut},
    group::{GroupId, MlsGroup, MlsGroupJoinConfig, StagedWelcome},
    key_packages::{KeyPackage as OpenMlsKeyPackage, KeyPackageIn},
    prelude::{ProcessedMessageContent, ProtocolVersion, SignatureScheme},
    treesync::RatchetTreeIn,
};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::{OpenMlsRustCrypto, RustCrypto};
use openmls_traits::{types::Ciphersuite, OpenMlsProvider};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tls_codec::{Deserialize as TlsDeserialize, Serialize as TlsSerialize};
use wasm_bindgen::prelude::*;

const SNAPSHOT_VERSION: u32 = 1;
const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519;

#[derive(Debug, thiserror::Error)]
enum TrustCoreError {
    #[error("invalid serialized state: {0}")]
    InvalidState(String),
    #[error("state integrity verification failed")]
    StateIntegrity,
    #[error("device signing key is missing from provider state")]
    MissingSigner,
    #[error("MLS group was not found")]
    GroupNotFound,
    #[error("unexpected MLS message type: {0}")]
    UnexpectedMessage(String),
}

fn js_error(error: impl std::fmt::Display) -> JsError {
    JsError::new(&error.to_string())
}

fn tls_bytes(message: &MlsMessageOut) -> Result<Vec<u8>, JsError> {
    message.tls_serialize_detached().map_err(js_error)
}

fn state_digest(values: &BTreeMap<String, String>) -> String {
    let mut digest = Sha256::new();
    for (key, value) in values {
        digest.update((key.len() as u64).to_be_bytes());
        digest.update(key.as_bytes());
        digest.update((value.len() as u64).to_be_bytes());
        digest.update(value.as_bytes());
    }
    URL_SAFE_NO_PAD.encode(digest.finalize())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSnapshot {
    version: u32,
    values: BTreeMap<String, String>,
    digest: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceCredential {
    account_id: String,
    device_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityBundle {
    account_id: String,
    device_id: String,
    public_key: String,
    ciphersuite: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberView {
    account_id: Option<String>,
    device_id: Option<String>,
    signature_key: String,
    leaf_index: u32,
}

#[wasm_bindgen]
#[derive(Default)]
pub struct Provider(OpenMlsRustCrypto);

impl AsRef<OpenMlsRustCrypto> for Provider {
    fn as_ref(&self) -> &OpenMlsRustCrypto {
        &self.0
    }
}

impl AsMut<OpenMlsRustCrypto> for Provider {
    fn as_mut(&mut self) -> &mut OpenMlsRustCrypto {
        &mut self.0
    }
}

#[wasm_bindgen]
impl Provider {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(js_name = exportState)]
    pub fn export_state(&self) -> Result<String, JsError> {
        let values = self
            .0
            .storage()
            .values
            .read()
            .map_err(|_| js_error("provider state lock is poisoned"))?;
        let encoded = values
            .iter()
            .map(|(key, value)| (URL_SAFE_NO_PAD.encode(key), URL_SAFE_NO_PAD.encode(value)))
            .collect::<BTreeMap<_, _>>();
        let snapshot = ProviderSnapshot {
            version: SNAPSHOT_VERSION,
            digest: state_digest(&encoded),
            values: encoded,
        };
        serde_json::to_string(&snapshot).map_err(js_error)
    }

    #[wasm_bindgen(js_name = importState)]
    pub fn import_state(serialized: &str) -> Result<Provider, JsError> {
        let snapshot: ProviderSnapshot = serde_json::from_str(serialized)
            .map_err(|error| js_error(TrustCoreError::InvalidState(error.to_string())))?;
        if snapshot.version != SNAPSHOT_VERSION {
            return Err(js_error(TrustCoreError::InvalidState(format!(
                "unsupported version {}",
                snapshot.version
            ))));
        }
        if state_digest(&snapshot.values) != snapshot.digest {
            return Err(js_error(TrustCoreError::StateIntegrity));
        }
        let provider = Provider::new();
        {
            let mut values = provider
                .0
                .storage()
                .values
                .write()
                .map_err(|_| js_error("provider state lock is poisoned"))?;
            for (key, value) in snapshot.values {
                values.insert(
                    URL_SAFE_NO_PAD.decode(key).map_err(js_error)?,
                    URL_SAFE_NO_PAD.decode(value).map_err(js_error)?,
                );
            }
        }
        Ok(provider)
    }

    #[wasm_bindgen(js_name = ciphersuite)]
    pub fn ciphersuite() -> String {
        "MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519".to_string()
    }
}

#[wasm_bindgen]
pub struct Identity {
    credential_with_key: CredentialWithKey,
    signer: SignatureKeyPair,
    account_id: String,
    device_id: String,
}

#[wasm_bindgen]
impl Identity {
    #[wasm_bindgen(constructor)]
    pub fn new(
        provider: &Provider,
        account_id: &str,
        device_id: &str,
    ) -> Result<Identity, JsError> {
        if account_id.trim().is_empty() || device_id.trim().is_empty() {
            return Err(js_error("accountId and deviceId are required"));
        }
        let credential_bytes = serde_json::to_vec(&DeviceCredential {
            account_id: account_id.to_string(),
            device_id: device_id.to_string(),
        })
        .map_err(js_error)?;
        let credential = BasicCredential::new(credential_bytes);
        let signer = SignatureKeyPair::new(SignatureScheme::ED25519).map_err(js_error)?;
        signer.store(provider.0.storage()).map_err(js_error)?;
        let credential_with_key = CredentialWithKey {
            credential: credential.into(),
            signature_key: signer.public().into(),
        };
        Ok(Self {
            credential_with_key,
            signer,
            account_id: account_id.to_string(),
            device_id: device_id.to_string(),
        })
    }

    #[wasm_bindgen(js_name = fromBundle)]
    pub fn from_bundle(provider: &Provider, serialized: &str) -> Result<Identity, JsError> {
        let bundle: IdentityBundle = serde_json::from_str(serialized).map_err(js_error)?;
        if bundle.ciphersuite != Provider::ciphersuite() {
            return Err(js_error("identity bundle ciphersuite mismatch"));
        }
        let public_key = URL_SAFE_NO_PAD
            .decode(&bundle.public_key)
            .map_err(js_error)?;
        let signer =
            SignatureKeyPair::read(provider.0.storage(), &public_key, SignatureScheme::ED25519)
                .ok_or_else(|| js_error(TrustCoreError::MissingSigner))?;
        let credential = BasicCredential::new(
            serde_json::to_vec(&DeviceCredential {
                account_id: bundle.account_id.clone(),
                device_id: bundle.device_id.clone(),
            })
            .map_err(js_error)?,
        );
        Ok(Self {
            credential_with_key: CredentialWithKey {
                credential: credential.into(),
                signature_key: public_key.into(),
            },
            signer,
            account_id: bundle.account_id,
            device_id: bundle.device_id,
        })
    }

    #[wasm_bindgen(js_name = exportBundle)]
    pub fn export_bundle(&self) -> Result<String, JsError> {
        serde_json::to_string(&IdentityBundle {
            account_id: self.account_id.clone(),
            device_id: self.device_id.clone(),
            public_key: URL_SAFE_NO_PAD.encode(self.signer.public()),
            ciphersuite: Provider::ciphersuite(),
        })
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = publicKey)]
    pub fn public_key(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.signer.public())
    }

    #[wasm_bindgen(js_name = accountId)]
    pub fn account_id(&self) -> String {
        self.account_id.clone()
    }

    #[wasm_bindgen(js_name = deviceId)]
    pub fn device_id(&self) -> String {
        self.device_id.clone()
    }

    #[wasm_bindgen(js_name = createKeyPackage)]
    pub fn create_key_package(&self, provider: &Provider) -> Result<Vec<u8>, JsError> {
        let package = OpenMlsKeyPackage::builder()
            .build(
                CIPHERSUITE,
                &provider.0,
                &self.signer,
                self.credential_with_key.clone(),
            )
            .map_err(js_error)?;
        package
            .key_package()
            .tls_serialize_detached()
            .map_err(js_error)
    }
}

#[wasm_bindgen]
pub struct AddMemberOutput {
    proposal: Vec<u8>,
    commit: Vec<u8>,
    welcome: Vec<u8>,
    ratchet_tree: Vec<u8>,
}

#[wasm_bindgen]
impl AddMemberOutput {
    #[wasm_bindgen(getter)]
    pub fn proposal(&self) -> Vec<u8> {
        self.proposal.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn welcome(&self) -> Vec<u8> {
        self.welcome.clone()
    }

    #[wasm_bindgen(getter, js_name = ratchetTree)]
    pub fn ratchet_tree(&self) -> Vec<u8> {
        self.ratchet_tree.clone()
    }
}

#[wasm_bindgen]
pub struct ProcessedEnvelope {
    kind: String,
    payload: Vec<u8>,
    active: bool,
    epoch: u64,
}

#[wasm_bindgen]
impl ProcessedEnvelope {
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        self.kind.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> Vec<u8> {
        self.payload.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn active(&self) -> bool {
        self.active
    }

    #[wasm_bindgen(getter)]
    pub fn epoch(&self) -> u64 {
        self.epoch
    }
}

#[wasm_bindgen]
pub struct Group {
    mls_group: MlsGroup,
}

#[wasm_bindgen]
impl Group {
    #[wasm_bindgen(js_name = createNew)]
    pub fn create_new(
        provider: &Provider,
        founder: &Identity,
        group_id: &[u8],
    ) -> Result<Group, JsError> {
        if group_id.is_empty() {
            return Err(js_error("groupId is required"));
        }
        let mls_group = MlsGroup::builder()
            .ciphersuite(CIPHERSUITE)
            .with_group_id(GroupId::from_slice(group_id))
            .build(
                &provider.0,
                &founder.signer,
                founder.credential_with_key.clone(),
            )
            .map_err(js_error)?;
        Ok(Group { mls_group })
    }

    #[wasm_bindgen(js_name = load)]
    pub fn load(provider: &Provider, group_id: &[u8]) -> Result<Group, JsError> {
        let group = MlsGroup::load(provider.0.storage(), &GroupId::from_slice(group_id))
            .map_err(js_error)?
            .ok_or_else(|| js_error(TrustCoreError::GroupNotFound))?;
        Ok(Group { mls_group: group })
    }

    #[wasm_bindgen(js_name = join)]
    pub fn join(
        provider: &Provider,
        welcome_bytes: &[u8],
        ratchet_tree_bytes: &[u8],
    ) -> Result<Group, JsError> {
        let mut welcome_slice = welcome_bytes;
        let welcome = match MlsMessageIn::tls_deserialize(&mut welcome_slice)
            .map_err(js_error)?
            .extract()
        {
            MlsMessageBodyIn::Welcome(welcome) => welcome,
            other => {
                return Err(js_error(TrustCoreError::UnexpectedMessage(format!(
                    "expected Welcome, got {other:?}"
                ))))
            }
        };
        let mut tree_slice = ratchet_tree_bytes;
        let tree = RatchetTreeIn::tls_deserialize(&mut tree_slice).map_err(js_error)?;
        let config = MlsGroupJoinConfig::builder().build();
        let mls_group = StagedWelcome::new_from_welcome(&provider.0, &config, welcome, Some(tree))
            .map_err(js_error)?
            .into_group(&provider.0)
            .map_err(js_error)?;
        Ok(Group { mls_group })
    }

    #[wasm_bindgen(js_name = addMember)]
    pub fn add_member(
        &mut self,
        provider: &Provider,
        sender: &Identity,
        key_package_bytes: &[u8],
    ) -> Result<AddMemberOutput, JsError> {
        let mut package_slice = key_package_bytes;
        let package = KeyPackageIn::tls_deserialize(&mut package_slice)
            .map_err(js_error)?
            .validate(&RustCrypto::default(), ProtocolVersion::Mls10)
            .map_err(js_error)?;
        let (proposal, _) = self
            .mls_group
            .propose_add_member(provider.as_ref(), &sender.signer, &package)
            .map_err(js_error)?;
        let (commit, welcome, _) = self
            .mls_group
            .commit_to_pending_proposals(&provider.0, &sender.signer)
            .map_err(js_error)?;
        let welcome = welcome.ok_or_else(|| js_error("OpenMLS did not produce a Welcome"))?;
        Ok(AddMemberOutput {
            proposal: tls_bytes(&proposal)?,
            commit: tls_bytes(&commit)?,
            welcome: tls_bytes(&welcome)?,
            ratchet_tree: self
                .mls_group
                .export_ratchet_tree()
                .tls_serialize_detached()
                .map_err(js_error)?,
        })
    }

    #[wasm_bindgen(js_name = mergePendingCommit)]
    pub fn merge_pending_commit(&mut self, provider: &mut Provider) -> Result<(), JsError> {
        self.mls_group
            .merge_pending_commit(provider.as_mut())
            .map_err(js_error)
    }

    #[wasm_bindgen(js_name = createMessage)]
    pub fn create_message(
        &mut self,
        provider: &Provider,
        sender: &Identity,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, JsError> {
        if plaintext.is_empty() {
            return Err(js_error("plaintext cannot be empty"));
        }
        let message = self
            .mls_group
            .create_message(provider.as_ref(), &sender.signer, plaintext)
            .map_err(js_error)?;
        tls_bytes(&message)
    }

    #[wasm_bindgen(js_name = processMessage)]
    pub fn process_message(
        &mut self,
        provider: &mut Provider,
        message_bytes: &[u8],
    ) -> Result<ProcessedEnvelope, JsError> {
        let mut message_slice = message_bytes;
        let message = MlsMessageIn::tls_deserialize(&mut message_slice)
            .map_err(js_error)?
            .extract();
        let processed = match message {
            MlsMessageBodyIn::PublicMessage(message) => self
                .mls_group
                .process_message(provider.as_ref(), message)
                .map_err(js_error)?,
            MlsMessageBodyIn::PrivateMessage(message) => self
                .mls_group
                .process_message(provider.as_ref(), message)
                .map_err(js_error)?,
            other => {
                return Err(js_error(TrustCoreError::UnexpectedMessage(format!(
                    "expected PublicMessage or PrivateMessage, got {other:?}"
                ))))
            }
        };
        let (kind, payload) = match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(application) => {
                ("application".to_string(), application.into_bytes())
            }
            ProcessedMessageContent::ProposalMessage(proposal)
            | ProcessedMessageContent::ExternalJoinProposalMessage(proposal) => {
                self.mls_group
                    .store_pending_proposal(provider.0.storage(), *proposal)
                    .map_err(js_error)?;
                ("proposal".to_string(), Vec::new())
            }
            ProcessedMessageContent::StagedCommitMessage(commit) => {
                self.mls_group
                    .merge_staged_commit(provider.as_mut(), *commit)
                    .map_err(js_error)?;
                ("commit".to_string(), Vec::new())
            }
        };
        Ok(ProcessedEnvelope {
            kind,
            payload,
            active: self.mls_group.is_active(),
            epoch: self.mls_group.epoch().as_u64(),
        })
    }

    #[wasm_bindgen(js_name = exportRatchetTree)]
    pub fn export_ratchet_tree(&self) -> Result<Vec<u8>, JsError> {
        self.mls_group
            .export_ratchet_tree()
            .tls_serialize_detached()
            .map_err(js_error)
    }

    #[wasm_bindgen(js_name = exportSecret)]
    pub fn export_secret(
        &self,
        provider: &Provider,
        label: &str,
        context: &[u8],
        length: usize,
    ) -> Result<Vec<u8>, JsError> {
        if !(16..=64).contains(&length) {
            return Err(js_error(
                "exported secret length must be between 16 and 64 bytes",
            ));
        }
        self.mls_group
            .export_secret(provider.0.crypto(), label, context, length)
            .map_err(js_error)
    }

    #[wasm_bindgen(js_name = membersJson)]
    pub fn members_json(&self) -> Result<String, JsError> {
        let members = self
            .mls_group
            .members()
            .map(|member| {
                let credential = BasicCredential::try_from(member.credential).ok();
                let device = credential.as_ref().and_then(|value| {
                    serde_json::from_slice::<DeviceCredential>(value.identity()).ok()
                });
                MemberView {
                    account_id: device.as_ref().map(|value| value.account_id.clone()),
                    device_id: device.as_ref().map(|value| value.device_id.clone()),
                    signature_key: URL_SAFE_NO_PAD.encode(member.signature_key),
                    leaf_index: member.index.u32(),
                }
            })
            .collect::<Vec<_>>();
        serde_json::to_string(&members).map_err(js_error)
    }

    #[wasm_bindgen(js_name = groupId)]
    pub fn group_id(&self) -> Vec<u8> {
        self.mls_group.group_id().as_slice().to_vec()
    }

    #[wasm_bindgen]
    pub fn epoch(&self) -> u64 {
        self.mls_group.epoch().as_u64()
    }

    #[wasm_bindgen(js_name = isActive)]
    pub fn is_active(&self) -> bool {
        self.mls_group.is_active()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two_member_group() -> (Provider, Identity, Group, Provider, Identity, Group) {
        let mut alice_provider = Provider::new();
        let bob_provider = Provider::new();
        let alice = Identity::new(&alice_provider, "alice", "alice-desktop").unwrap();
        let bob = Identity::new(&bob_provider, "bob", "bob-phone").unwrap();
        let mut alice_group = Group::create_new(&alice_provider, &alice, b"room:general").unwrap();
        let output = alice_group
            .add_member(
                &alice_provider,
                &alice,
                &bob.create_key_package(&bob_provider).unwrap(),
            )
            .unwrap();
        alice_group
            .merge_pending_commit(&mut alice_provider)
            .unwrap();
        let bob_group = Group::join(&bob_provider, &output.welcome, &output.ratchet_tree).unwrap();
        (
            alice_provider,
            alice,
            alice_group,
            bob_provider,
            bob,
            bob_group,
        )
    }

    #[test]
    fn encrypts_and_decrypts_application_messages() {
        let (alice_provider, alice, mut alice_group, mut bob_provider, _, mut bob_group) =
            two_member_group();
        let ciphertext = alice_group
            .create_message(&alice_provider, &alice, b"hello from Nexora")
            .unwrap();
        assert!(!ciphertext.windows(6).any(|slice| slice == b"Nexora"));
        let decrypted = bob_group
            .process_message(&mut bob_provider, &ciphertext)
            .unwrap();
        assert_eq!(decrypted.kind, "application");
        assert_eq!(decrypted.payload, b"hello from Nexora");
    }

    #[test]
    fn provider_snapshot_restores_identity_and_group() {
        let (alice_provider, alice, alice_group, _, _, _) = two_member_group();
        let identity_bundle = alice.export_bundle().unwrap();
        let state = alice_provider.export_state().unwrap();
        let restored = Provider::import_state(&state).unwrap();
        let restored_identity = Identity::from_bundle(&restored, &identity_bundle).unwrap();
        let restored_group = Group::load(&restored, alice_group.group_id().as_slice()).unwrap();
        assert_eq!(restored_identity.public_key(), alice.public_key());
        assert_eq!(restored_group.epoch(), alice_group.epoch());
        assert_eq!(
            restored_group.members_json().unwrap(),
            alice_group.members_json().unwrap()
        );
    }

    #[test]
    fn both_members_export_the_same_attachment_secret() {
        let (alice_provider, _, alice_group, bob_provider, _, bob_group) = two_member_group();
        let context = b"attachment:42";
        assert_eq!(
            alice_group
                .export_secret(&alice_provider, "nexora attachment", context, 32)
                .unwrap(),
            bob_group
                .export_secret(&bob_provider, "nexora attachment", context, 32)
                .unwrap(),
        );
    }

    #[test]
    fn provider_snapshot_detects_tampering() {
        let provider = Provider::new();
        let identity = Identity::new(&provider, "alice", "device").unwrap();
        let _ = identity.create_key_package(&provider).unwrap();
        let state = provider.export_state().unwrap();
        let mut value: serde_json::Value = serde_json::from_str(&state).unwrap();
        value["digest"] = serde_json::Value::String("tampered".to_string());
        assert!(Provider::import_state(&value.to_string()).is_err());
    }
}
