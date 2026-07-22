"use strict";

const PULSE_CATALOG = Object.freeze([
  Object.freeze({
    code: "avatar_frame_neon",
    displayName: "Неоновая рамка",
    description: "Анимированный фиолетово-бирюзовый контур аватара.",
    category: "profile",
    scope: "user",
    priceImpulses: 120,
    durationDays: 3650,
    effect: Object.freeze({ avatarFrame: "neon" }),
  }),
  Object.freeze({
    code: "profile_accent_aurora",
    displayName: "Акцент Aurora",
    description: "Градиентный акцент профиля и карточки пользователя.",
    category: "profile",
    scope: "user",
    priceImpulses: 180,
    durationDays: 3650,
    effect: Object.freeze({ profileColor: "aurora" }),
  }),
  Object.freeze({
    code: "message_style_prism",
    displayName: "Сообщения Prism",
    description: "Мягкий призматический фон собственных сообщений.",
    category: "messages",
    scope: "user",
    priceImpulses: 220,
    durationDays: 3650,
    effect: Object.freeze({ messageStyle: "prism" }),
  }),
  Object.freeze({
    code: "sticker_pack_nova",
    displayName: "Набор Nova",
    description: "Дополнительный набор реакций и стикеров Nexora.",
    category: "reactions",
    scope: "user",
    priceImpulses: 140,
    durationDays: 3650,
    effect: Object.freeze({ stickerPack: "nova" }),
  }),
  Object.freeze({
    code: "room_reaction_pack",
    displayName: "Реакции комнаты",
    description: "Расширенный набор реакций для всех участников комнаты на 30 дней.",
    category: "room",
    scope: "room",
    priceImpulses: 400,
    durationDays: 30,
    effect: Object.freeze({ reactionPack: "expanded" }),
  }),
  Object.freeze({
    code: "room_theme_midnight",
    displayName: "Тема Midnight",
    description: "Особая тема и акцент комнаты на 30 дней.",
    category: "room",
    scope: "room",
    priceImpulses: 650,
    durationDays: 30,
    effect: Object.freeze({ theme: "midnight" }),
  }),
  Object.freeze({
    code: "room_banner_aurora",
    displayName: "Баннер Aurora",
    description: "Динамический баннер комнаты на 30 дней.",
    category: "room",
    scope: "room",
    priceImpulses: 500,
    durationDays: 30,
    effect: Object.freeze({ bannerStyle: "aurora" }),
  }),
]);

function catalogItem(code) {
  return PULSE_CATALOG.find((item) => item.code === String(code || "")) || null;
}

function publicCatalog() {
  return PULSE_CATALOG.map(({ effect, ...item }) => ({ ...item }));
}

module.exports = { PULSE_CATALOG, catalogItem, publicCatalog };
