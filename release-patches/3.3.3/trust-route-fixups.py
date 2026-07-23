from pathlib import Path

root = Path(__file__).resolve().parents[2]
path = root / "server/trust-routes.cjs"
source = path.read_text(encoding="utf-8")
old = '''      conversationId: conversation.id,
      emit: (payload) => emitConversation(conversation.id, "mls.welcome_requested", payload),
    });'''
new = '''      conversationId: conversation.id,
      emit: (payload) => emitConversation(conversation.id, "mls.welcome_requested", payload),
      forceRejoin: Boolean(request.body?.forceRejoin),
    });'''
if source.count(old) != 1:
    raise RuntimeError(f"trust-routes.cjs: expected one Welcome request block, found {source.count(old)}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("Nexora 3.3.3 MLS route fixup applied.")
