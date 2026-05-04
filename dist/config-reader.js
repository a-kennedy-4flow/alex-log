"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConfig = readConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
function readConfig(filePath) {
    const fileContent = fs_1.default.readFileSync(path_1.default.resolve(filePath), 'utf8');
    try {
        return yaml_1.default.parse(fileContent);
    }
    catch (error) {
        console.error(`Error reading config file: ${error}`);
        throw error;
    }
}
//# sourceMappingURL=config-reader.js.map