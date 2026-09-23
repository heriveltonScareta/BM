/** Arquivos minimos validos para testes de upload. */
export const PDF_MIN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n",
  "latin1",
);
export const XML_MIN = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe35260900000000000000550010000012341000012341"><ide><nNF>1234</nNF></ide></infNFe></NFe></nfeProc>',
  "utf8",
);
export const PNG_MIN = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
