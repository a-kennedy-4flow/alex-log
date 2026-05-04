"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndMakeFolder = checkAndMakeFolder;
exports.createDayTemplate = createDayTemplate;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const nunjucks_1 = __importDefault(require("nunjucks"));
var nun = new nunjucks_1.default.Environment(new nunjucks_1.default.FileSystemLoader('templates'));
function getPrettyDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function checkAndMakeFolder(folder_location) {
    const dateFolder = path_1.default.join(folder_location, getPrettyDate());
    if (!fs_1.default.existsSync(dateFolder)) {
        fs_1.default.mkdirSync(dateFolder, { recursive: true });
    }
    createDayTemplate(dateFolder);
    return dateFolder;
}
// Sample usage of render function
function createDayTemplate(date_folder) {
    const today = new Date();
    const context = {
        title: today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        prettydate: getPrettyDate(),
        heading: "To do today...",
        description: "This is the template for today's work."
    };
    const rendered = nun.render("day-template.j2", { ...context });
    fs_1.default.writeFileSync(path_1.default.join(date_folder, 'day.md'), rendered);
}
//# sourceMappingURL=new-day.js.map