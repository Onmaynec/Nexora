const decoder = new TextDecoder();
const MLS_LEAF_NODE_TYPE = 1;

function parseCredential(credential) {
  if (!credential?.identity) return null;
  try {
    const value = JSON.parse(decoder.decode(credential.identity));
    if (value?.version !== 1 || !value.userId || !value.deviceId) return null;
    return { userId: String(value.userId), deviceId: String(value.deviceId) };
  } catch {
    return null;
  }
}

export function memberDirectory(state) {
  const directory = new Map();
  for (let nodeIndex = 0; nodeIndex < (state?.ratchetTree?.length || 0); nodeIndex += 2) {
    const node = state.ratchetTree[nodeIndex];
    if (!node || node.nodeType !== MLS_LEAF_NODE_TYPE) continue;
    const identity = parseCredential(node.leaf?.credential);
    if (!identity) continue;
    const leafIndex = nodeIndex / 2;
    directory.set(`${identity.userId}:${identity.deviceId}`, { ...identity, leafIndex, leaf: node.leaf });
  }
  return directory;
}
