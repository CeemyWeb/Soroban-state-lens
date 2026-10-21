# Decoder worker browser regression

Run `npm run dev`, then open
`http://localhost:3000/browser-tests/decoder-worker.html` in a browser. The page
reports `PASS` when both the vector and map regressions succeed through the real
Comlink worker, or displays the failure details.
