import fs from 'fs';
import path from 'path';
import yaml from 'yaml'


interface Config {
    banaana_location?: string;
    config_location?: string;
    yellowstone_location?: string;
    [key: string]: any;
}

export function readConfig(filePath: string): Config {
    const fileContent = fs.readFileSync(path.resolve(filePath), 'utf8');

    try {
        return yaml.parse(fileContent) as Config;
    } catch (error) {
        console.error(`Error reading config file: ${error}`);
        throw error;
    }
}
