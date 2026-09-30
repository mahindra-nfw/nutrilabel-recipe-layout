# NutriLabel UI Lab

This is a test environment for comparing three recipe-builder layouts. All three use the same ingredient library, sample recipe and nutrition engine. Only the interface is different.

## Run it (any machine)

You don't need `npm install` or a build step.

- **Windows:** double-click `start.bat`. It uses Node if it is installed, otherwise Python.
- **Node:** `node server.js` (to change the port: `set PORT=8080` then `node server.js`)
- **Python:** `python -m http.server 5180`

## Usability testing

1. Open a layout, then click **🧪 Usability test** in the bottom-left corner and enter the tester's name.
2. Do the 7 tasks. The panel records time, clicks, completed/cancelled and a 1–5 ease rating for each one.
3. Do the same tasks in the other layouts. After finishing a layout, the panel shows a **⬇ Download my results** button. It downloads a CSV (opens in Excel) that the tester sends back to you.

Results and recipe edits are saved in the browser's `localStorage`, per browser. To collect results from several machines, export a CSV on each one.

## Files

```
shared/data.js      ingredient library (~70 common ingredients, approx. nutrition /100 g) + sample recipe
shared/engine.js    batch/yield/% math, nutrition label, picker, pan/zoom canvas, undo
shared/tester.js    usability test panel + task list
node-graph/         Layout A
recipe-cards/       Layout B
recipe-sheet/       Layout C
server.js           zero-dependency static server
```

The model is the same in all three layouts: raw ingredients go into (sub-)assemblies, and assemblies go into the final product. Yield loss is treated as moisture loss, so it concentrates the nutrients per gram.

Each layout keeps its recipes as tabs along the bottom, like sheets in Excel: **+** adds a recipe, double-click renames, right-click opens Duplicate/Delete, and you can drag tabs to reorder them.
