import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
var nun = new nunjucks.Environment(new nunjucks.FileSystemLoader('templates'));

function getPrettyDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


export function checkAndMakeFolder(folder_location: string): string {
    const dateFolder = path.join(folder_location, getPrettyDate());

    if (!fs.existsSync(dateFolder)) {
        fs.mkdirSync(dateFolder, { recursive: true });
    }
    createDayTemplate(dateFolder);

    return dateFolder;
}

// Sample usage of render function
export function createDayTemplate(date_folder: string): void {
    const today = new Date();

    const context = {
        title: today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        prettydate: getPrettyDate(),
        heading: "To do today...",
        description: "This is the template for today's work."
    };
    const rendered = nun.render("day-template.j2", { ...context });
    fs.writeFileSync(path.join(date_folder, 'day.md'), rendered);
}