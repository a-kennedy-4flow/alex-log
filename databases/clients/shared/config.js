// every client is configured the same way, through the same environment variables
export const DB = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? 'password',
}

export const num = (name, fallback) => Number(process.env[name] ?? fallback)
export const on = (name) => !/^(off|false|0|no)$/i.test(process.env[name] ?? '')
export const where = () => `${DB.host}:${DB.port}`
