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
    socketInstance.timeout(timeout).emit(event, payload, (error, result) => {
      if (error) reject(new Error("Сервер не ответил вовремя."));
      else if (!result?.ok) reject(new Error(result?.error ?? "Операция не выполнена."));
      else resolve(result);
    });
  });
}
