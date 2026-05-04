"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_reader_1 = require("./config-reader");
const new_day_1 = require("./new-day");
console.log(main("Alex"));
function main(name) {
    const config_location = process.env.CONFIG_FILE_PATH || './config.yml';
    const config = (0, config_reader_1.readConfig)(config_location);
    try {
        (0, new_day_1.checkAndMakeFolder)(config.config_location);
    }
    catch (error) {
        return "Failed!";
    }
    return `Hello, ${name}!`;
}
//# sourceMappingURL=main.js.map