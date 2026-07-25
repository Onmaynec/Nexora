"use strict";

const fs = require("node:fs");

const file = "scripts/apply-connect-security-hardening.cjs";
const before = fs.readFileSync(file, "utf8");
const broken = "    if (!expectedSessionId || expectedSessionId !== auth.session.id) throw connectError(\"Вызов закреплён за другим устройством.\", \"FORBIDDEN\", 403);";
const fixed = "    const canClaimIncoming = !expectedSessionId && call.calleeId === auth.user.id && call.state === \"ringing\";\n    if (!canClaimIncoming && expectedSessionId !== auth.session.id) throw connectError(\"Вызов закреплён за другим устройством.\", \"FORBIDDEN\", 403);";
const occurrences = before.split(broken).length - 1;
if (occurrences !== 1) throw new Error(`Expected one session-binding anchor, found ${occurrences}.`);
fs.writeFileSync(file, before.replace(broken, fixed), "utf8");
