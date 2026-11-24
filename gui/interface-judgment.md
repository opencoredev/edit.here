# Interface judgment

Build the smallest complete interface that serves the requested task. Before deciding how something should look or read, ask whether it should exist. Each visible element, whether a section, control, state, badge, or line of copy, should add information, enable an action, or provide context the user cannot act without. Build what was requested: do not add settings, filters, secondary actions, summary panels, or other features nobody asked for. Empty space does not need filler copy or decoration. Correct tokens alone do not make a clear interface. Apply this guidance to custom markup, new routes, composed components, and revisions to existing screens.

### Start with what the app already provides

Inspect the surrounding navigation, breadcrumbs, actions, and layout before adding page content. If the breadcrumb already provides the required return route, another back row usually adds no value. Preserve additional navigation when it has a distinct purpose or is needed in a different responsive context.

A specific product title is a sufficient starting point. Add metadata only when it helps users understand or act on the content, using information the app actually knows. A title such as “Nephew’s bookshelf” can stand alone above its books, filters, and Add a book action. Do not automatically pair a title with a subtitle, category label, status badge, or introduction. Put the requested summary in the content, without another version under the title.

### Keep copy that earns its place

Most unhelpful copy is not badly written; it should not be on the screen, and rewording it only makes the wrong thing read better. Read each string beside its label, value, and control, then stop at the first test it fails and remove it:

1. **Would the user have wondered about this?** Copy that answers a question nobody had plants one. “The preview is rendered at the exact size used on your profile” makes people doubt a preview they trusted.
2. **Does something beside it already say it?** A field labelled “Retry limit” does not need “how many times we retry” beneath it. A bare “30” does need “seconds”.
3. **Does it rule out a failure instead of describing behavior?** Reassurance about a fixed bug, a defense of a design decision, or hedging about something that works (“this may look slow but it is not”) hands the user a worry they arrived without. Implementation commentary such as “Saved on this browser · No account needed” is the same.
4. **Remove the failing part. If nothing is left, remove the element**, not a shortened stub of it.

Copy stays when the user cannot act without it: a real consequence at the moment of choosing (“Anything not yet synced is lost”), a compatibility or scope fact they cannot see, what an empty state means and its next action, and units or format on a bare value. Keep the consequence and cut instructions about when to press a button they can already see. If a string matters only in a rare state, show it in that state. Preserve required labels, validation, accessibility, and instructions that prevent a real mistake.

Omit invented eyebrows (small labels above headings), taglines, sentimental subtitles, motivational empty-state prose, header/footer slogans, and decorative icon-and-text badges. Do not turn an ordinary app screen into a marketing hero unless that is the requested purpose. Express personality through the chosen theme and meaningful content. A friendly phrase does not need an icon, pill, or status dot; reserve those cues for meaningful categories, actions, or actual state. Use one clear action at the point of need; repeat it only when placement or a different responsive context makes it useful.

### Give information a clear home

Assign each fact a primary place. Use summary prose to explain significance, a KPI to highlight a value, a chart to expose a trend or comparison, and a table for exact lookup. These can coexist when they answer different questions. Avoid repeating the same headline value in prose, a KPI, and a chart header at equal emphasis. A chart's plotted values and an expandable data table can repeat the underlying data because they support different tasks.

Keep chart titles descriptive. Add captions only for interpretation or context the surrounding content does not provide. Retain units, series identification, meaningful date ranges, and definitions needed to read the chart. If several views share a period, state it at their common scope when that remains clear; identify different periods where necessary.

After a disclosure such as “View monthly data,” reveal the data directly. Use the existing heading or disclosure label to name the region or table where appropriate; add a visible caption only if it contributes new information. Preserve semantic table headers and accessible names. If data is illustrative, communicate that once in a relevant location without repeating a sample-data badge and disclaimer throughout the page.

### Reuse a small visual vocabulary

Choose the smallest useful subset of the active theme's text steps, font roles, and weights. A new section does not automatically need a new style. Give peer card and chart headings the same text size and weight, and keep equivalent values, labels, and metadata consistent across views. A page title or focal metric can have a distinct role when that difference explains the hierarchy. Semantic heading levels and visual styles are separate: preserve a meaningful document outline while styling peers consistently.

Use regular paragraph text by default. Emphasize a phrase when it materially helps scanning or understanding; avoid bolding a metric simply because it is a number, especially when a nearby callout already gives it prominence. Use spacing and grouping before adding another font size, weight, color, surface, or divider. Keep the chosen theme's character and existing component treatments.

### Make widths and alignment deliberate

Set prose in a readable column and align related headings, paragraphs, and data regions to a shared grid. Short copy can end before the right edge. A wider chart or table can sit below narrower prose when the relationship is clear. Avoid an unexplained inner text width inside a much wider bordered or filled container; choose the container and text widths together. Do not justify text, add filler, or enlarge type to make a paragraph fill a box. Reflow the layout on narrow screens while retaining readable type and controls.

Use the shared `text-wrap: pretty` default in [Foundations](foundations.md) for wrapping text. When reviewing line breaks, prefer shorter useful copy and suitable widths; do not add manual line breaks or nonbreaking-space patches just to repair one viewport.

### Keep visual cues consistent with behavior

Render fixed dates and other read-only values as metadata. Use the existing control treatment for values the user can change. Do not give a static label a button-like surface, hover state, chevron, or pointer cursor. Equivalent controls should look and behave consistently; use one shared control when it changes the same input across multiple views. Add an interaction only when it serves the task and has real behavior.

### Finish by removing what adds nothing

Review the normal page, empty states, and expanded states within the project's review workflow. For each section, control, eyebrow, subtitle, badge, explanation, and footer line, identify the distinct information or action it contributes; remove it when there is none or when it was not requested. Remove repeated navigation, labels, facts, captions, and style variations when doing so preserves meaning and usability. Keep the requested content, essential qualifications, accessible structure, useful metadata, and cues needed to act. A title without supporting copy is a complete design choice. Useful context earns its place; it is not a default slot to fill.
