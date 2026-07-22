function recoveryError(message, code, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function integer(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

export async function replayMissedCommits({
  local,
  remote,
  result,
  decodeCommit,
  hashCommit,
  processCommit,
  resolveDevice,
} = {}) {
  if (!local || !remote || typeof decodeCommit !== "function" || typeof hashCommit !== "function" || typeof processCommit !== "function") {
    throw recoveryError("Недостаточно данных для восстановления MLS.", "MLS_RECOVERY_INPUT_INVALID");
  }
  const localEpoch = integer(local.epoch);
  const remoteEpoch = integer(remote.epoch);
  if (localEpoch == null || remoteEpoch == null || localEpoch < 0 || remoteEpoch < localEpoch) {
    throw recoveryError("Некорректные границы MLS epoch.", "MLS_COMMIT_SEQUENCE_INVALID");
  }
  if (localEpoch === remoteEpoch) return { state: local.state, publicStateHash: local.publicStateHash, epoch: localEpoch };

  const responseGroup = result?.group || {};
  if (String(responseGroup.id || remote.id) !== String(remote.id)
    || String(responseGroup.conversationId || remote.conversationId) !== String(remote.conversationId)
    || integer(responseGroup.epoch ?? remoteEpoch) !== remoteEpoch) {
    throw recoveryError("Журнал MLS commit не соответствует запрошенной группе.", "MLS_COMMIT_SCOPE_INVALID");
  }

  const commits = Array.isArray(result?.commits) ? result.commits : [];
  if (!commits.length || commits.length > 500) {
    throw recoveryError("Журнал MLS commit неполон или превышает лимит.", "MLS_COMMIT_LOG_INVALID", { count: commits.length });
  }

  let state = local.state;
  let publicStateHash = local.publicStateHash;
  let expectedPrevious = localEpoch;
  const seenHashes = new Set();

  for (const item of commits) {
    const previousEpoch = integer(item?.previousEpoch);
    const epoch = integer(item?.epoch);
    const declaredHash = String(item?.commitHash || "").toLowerCase();
    if (previousEpoch !== expectedPrevious || epoch !== expectedPrevious + 1) {
      throw recoveryError("Нарушена последовательность MLS commit.", "MLS_COMMIT_SEQUENCE_INVALID", {
        expectedPrevious,
        previousEpoch,
        epoch,
      });
    }
    if (!declaredHash) throw recoveryError("MLS commit не содержит hash.", "MLS_COMMIT_HASH_INVALID");
    if (seenHashes.has(declaredHash)) throw recoveryError("MLS commit повторён в ответе сервера.", "MLS_COMMIT_REPLAY", { commitHash: declaredHash });
    seenHashes.add(declaredHash);

    let commitBytes;
    try { commitBytes = decodeCommit(item.commit); }
    catch (error) { throw recoveryError("MLS commit имеет неверный формат.", "MLS_COMMIT_FORMAT_INVALID", { cause: error?.message }); }
    const actualHash = String(await hashCommit(commitBytes)).toLowerCase();
    if (actualHash !== declaredHash) {
      throw recoveryError("Hash MLS commit не совпадает с payload.", "MLS_COMMIT_HASH_MISMATCH", { declaredHash, actualHash });
    }

    const processed = await processCommit({ state, commitBytes, resolveDevice });
    if (integer(processed?.epoch) !== epoch) {
      throw recoveryError("Обработанный MLS commit вернул другую epoch.", "MLS_EPOCH_CONFLICT", { expected: epoch, actual: processed?.epoch });
    }
    if (item.publicStateHash && String(processed.publicStateHash) !== String(item.publicStateHash)) {
      throw recoveryError("Public state hash MLS commit не совпадает.", "MLS_PUBLIC_STATE_HASH_MISMATCH", { epoch });
    }
    state = processed.state;
    publicStateHash = processed.publicStateHash;
    expectedPrevious = epoch;
  }

  if (expectedPrevious !== remoteEpoch) {
    throw recoveryError("В журнале MLS commit отсутствуют необходимые epoch.", "MLS_COMMIT_GAP", { expected: remoteEpoch, actual: expectedPrevious });
  }
  if (remote.publicStateHash && String(publicStateHash) !== String(remote.publicStateHash)) {
    throw recoveryError("Итоговый MLS public state hash не совпадает с сервером.", "MLS_PUBLIC_STATE_HASH_MISMATCH", { epoch: remoteEpoch });
  }
  return { state, publicStateHash, epoch: remoteEpoch };
}
