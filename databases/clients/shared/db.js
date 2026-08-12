import mysql from 'mysql2/promise'
import { DB } from './config.js'
import { LANGS, randomString } from './languages.js'

export const dbName = (lang) => `strings_${lang}`
// always fully qualified, so the same query works from any pool
export const table = (lang) => `\`${dbName(lang)}\`.strings`
const SCHEMA = 'CREATE TABLE IF NOT EXISTS strings (id INT AUTO_INCREMENT PRIMARY KEY, value VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'

// one pool per language database, creating anything that is missing — for the clients that write
export async function openLanguagePools() {
    const admin = await mysql.createConnection(DB)
    const pools = {}
    for (const lang of LANGS) {
        await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName(lang)}\``)
        pools[lang] = mysql.createPool({ ...DB, database: dbName(lang), connectionLimit: 4 })
        await pools[lang].query(SCHEMA)
    }
    await admin.end()
    return pools
}

// no database selected and nothing created — for the clients that only read
export const openPool = (connectionLimit = 5) => mysql.createPool({ ...DB, connectionLimit })

export const writeRandom = (pool, lang) => pool.query(`INSERT INTO ${table(lang)} (value) VALUES (?)`, [randomString(lang)])

export async function readLanguage(pool, lang) {
    const t = performance.now()
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table(lang)}`)
    const [[first]] = await pool.query(`SELECT value, created_at FROM ${table(lang)} ORDER BY id ASC LIMIT 1`)
    const [[last]] = await pool.query(`SELECT value, created_at FROM ${table(lang)} ORDER BY id DESC LIMIT 1`)
    return { lang, database: dbName(lang), total, first, last, ms: performance.now() - t }
}
