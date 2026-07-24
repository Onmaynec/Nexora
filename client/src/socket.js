import { io } from "socket.io-client";
import { CLIENT_VERSION } from "./api";

let socket;

export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: false, reconnection: true, reconnectionDelayMax: 3_000, auth: { clientVersion: CLIENT_VERSION } });
  }
  return socket;
}

export function emitAck(socketInstance, event, payload, timeout = 7_000) {
  return new Promise((resolve, reject) => {
    socketInstance.timeout(timeout).emit(event, payload, (timeoutError, result) => {
      if (timeoutError) {
        const error = new Error("Сервер не ответил вовремя.");
        error.code = "TEMPORARY_UNAVAILABLE";
        error.retryable = true;
        reject(error);
        return;
      }
      if (!result?.ok) {
        const error = new Error(result?.message ?? result?.error ?? "Операция не выполнена.");
        error.code = result?.code || "REQUEST_FAILED";
        error.details = result?.details || {};
        error.requestId = result?.requestId || null;
        error.retryAfter = Number(result?.retryAfter || result?.details?.retryAfter || 0) || null;
        error.retryable = result?.retryable !== false;
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}
