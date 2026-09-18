/* Every nutrient named in the app leads to the page that says what it is.

   Because a) a reader who does not know what Pantothensäure is cannot weigh the figure
   beside it b) the profile carries the caveats that figure rests on c) the fold has to
   match make_page.file_of or the link lands nowhere. */
export function profileHref(name: string): string {
  const slug = name
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `/pages/profiles/${slug}.html`
}
