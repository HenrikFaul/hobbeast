# Generated delivery artifacts

This directory stores reconstructable delivery artifacts created during the Hobbeast redesign workflow.

## Contents
- `pdf_base64_chunks/` — chunked base64 parts for `versioning/01410001.pdf`
- `zip_base64_chunks/` — chunked base64 parts for `hobbeast-redesign-batch1.zip`

## Reconstruction
Concatenate the chunk files in lexical order and base64-decode the result.

Examples:

### PDF
```bash
cat artifacts/pdf_base64_chunks/part-*.txt > 01410001.pdf.b64
base64 -d 01410001.pdf.b64 > 01410001.pdf
```

### ZIP
```bash
cat artifacts/zip_base64_chunks/part-*.txt > hobbeast-redesign-batch1.zip.b64
base64 -d hobbeast-redesign-batch1.zip.b64 > hobbeast-redesign-batch1.zip
```
