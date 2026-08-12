// one language, one database — the alphabet is what makes a string recognisable as its own
export const ALPHABETS = {
    english: 'abcdefghijklmnopqrstuvwxyz',
    german: 'abcdefghijklmnopqrstuvwxyzäöüß',
    french: 'abcdefghijklmnopqrstuvwxyzàçéèêîôûù',
    russian: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    japanese: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん',
}
export const LANGS = Object.keys(ALPHABETS)

export const pick = (xs) => xs[Math.floor(Math.random() * xs.length)]

export function randomString(lang) {
    const alphabet = [...ALPHABETS[lang]]
    const n = 8 + Math.floor(Math.random() * 24)
    return Array.from({ length: n }, () => pick(alphabet)).join('')
}
