import { config } from "process";
import { readConfig } from "./config-reader";
import { checkAndMakeFolder } from "./new-day";


console.log(main("Alex"));
function main(name: string): string {
    const config_location = process.env.CONFIG_FILE_PATH || './config.yml';
    const config = readConfig(config_location);
    try {

        checkAndMakeFolder(config.config_location!);
    } catch (error) {
        return "Failed!"
    }
    return `Hello, ${name}!`;
}