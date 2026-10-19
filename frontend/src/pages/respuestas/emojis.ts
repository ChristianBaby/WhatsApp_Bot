/**
 * Emojis del selector, por categoria como en WhatsApp. Lista curada (los mas
 * usados) para no cargar una libreria de emojis entera en el panel.
 */
export type CategoriaEmoji = { id: string; icono: string; nombre: string; emojis: string[] };

const lista = (texto: string) => [...new Set(texto.trim().split(/\s+/u))];

export const CATEGORIAS_EMOJI: CategoriaEmoji[] = [
  {
    id: 'caras',
    icono: '😀',
    nombre: 'Caras y personas',
    emojis: lista(`
      😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔
      🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓
      🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀
      💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾
      👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏
      ✍️ 💪 🦾 👀 👁️ 🧠 🫶 💅 🤳
      👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙋 🙋‍♂️ 🙋‍♀️ 🙅 🙆 💁 🤷 🤷‍♂️ 🤷‍♀️ 🤦 🤦‍♂️ 🤦‍♀️ 🙇 💆 🧑‍💻 👨‍💼 👩‍💼
      🧑‍🍳 🧑‍🔧 👮 🕵️ 👷 🤵 👰 🎅 🧑‍🤝‍🧑 👫 👪
    `),
  },
  {
    id: 'corazones',
    icono: '❤️',
    nombre: 'Corazones y símbolos',
    emojis: lista(`
      ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💯 💢 💥 💫 💦 💨 💬 💭 💤
      ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ✖️ ➗ ❓ ❔ ❗ ❕ ‼️ ⁉️ ⚠️ 🚫 ⛔ 🔞 ♻️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹
      ⭐ 🌟 ✨ ⚡ 🔥 🎉 🎊 🆕 🆗 🆒 🆓 🔝 🔜 ‼️ #️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 ▶️ ⏸️ ⏹️ ⏺️ ⏩ ⏪
      ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↩️ ↪️ 🔄 🔃 🔀 🔁 ℹ️ 🅿️ ©️ ®️ ™️ 💲 💱
    `),
  },
  {
    id: 'naturaleza',
    icono: '🐶',
    nombre: 'Animales y naturaleza',
    emojis: lista(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐴 🦄 🐝
      🐛 🦋 🐌 🐞 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐠 🐟 🐬 🐳 🦈 🐊 🐘 🦒 🦘 🐪 🦙 🐕 🐈 🐓 🦜 🕊️ 🐾
      🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌾 🌺 🌻 🌹 🥀 🌷 🌼 🌸 💐 🍄 🌎 🌍 🌏 🌙 🌛 ⭐ ☀️ 🌤️
      ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 🌈 🌊 💧 ☔
    `),
  },
  {
    id: 'comida',
    icono: '🍔',
    nombre: 'Comida y bebida',
    emojis: lista(`
      🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐
      🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍰
      🎂 🧁 🥧 🍦 🍩 🍪 🍫 🍬 🍭 🍯 ☕ 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊
    `),
  },
  {
    id: 'actividades',
    icono: '⚽',
    nombre: 'Actividades',
    emojis: lista(`
      ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎽 🎿 🏂 🏋️ 🤸 🚴 🏊 🧘 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫
      🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🎯 🎳 🎮 🧩 🎁 🎈 🎀
    `),
  },
  {
    id: 'viajes',
    icono: '🚗',
    nombre: 'Viajes y lugares',
    emojis: lista(`
      🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚝 🚄
      🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼
      🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏢 🏬 🏣 🏥 🏦 🏨 🏪 🏫 🏩 💒
      ⛪ 🕌 🛕 🕍 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁
    `),
  },
  {
    id: 'objetos',
    icono: '💡',
    nombre: 'Objetos',
    emojis: lista(`
      ⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📟 📠 📺 📻 🎙️ ⏰ ⏳ ⌛ 📡 🔋 🔌 💡 🔦
      🕯️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🔧 🔨 🛠️ ⚙️ 🔩 🧰 🧲 🔫 💣 🔪 🛡️ 🔮 💈 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿
      🛁 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📜 📃 📄 📑 📊
      📈 📉 🗒️ 🗓️ 📆 📅 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🔗 📎 🖇️ 📐
      📏 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓
    `),
  },
  {
    id: 'banderas',
    icono: '🏳️',
    nombre: 'Banderas',
    emojis: lista(`
      🇵🇪 🇦🇷 🇧🇴 🇧🇷 🇨🇱 🇨🇴 🇨🇷 🇨🇺 🇪🇨 🇸🇻 🇪🇸 🇺🇸 🇬🇹 🇭🇳 🇲🇽 🇳🇮 🇵🇦 🇵🇾 🇵🇷 🇩🇴 🇺🇾 🇻🇪 🇨🇦 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇵🇹 🇯🇵 🇨🇳
      🇰🇷 🇮🇳 🇦🇺 🇪🇺 🏳️ 🏴 🏁 🚩 🏳️‍🌈
    `),
  },
];

/** Las 6 reacciones rapidas de WhatsApp. */
export const REACCIONES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const CLAVE_RECIENTES = 'chat:emojisRecientes';
const MAX_RECIENTES = 32;

export function emojisRecientes(): string[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]') as unknown;
    return Array.isArray(guardado) ? guardado.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

export function recordarEmoji(emoji: string): void {
  try {
    const lista = [emoji, ...emojisRecientes().filter((e) => e !== emoji)].slice(0, MAX_RECIENTES);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (modo privado): simplemente no hay recientes.
  }
}
