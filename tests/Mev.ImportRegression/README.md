# Verifiche importazione gare

Esegui dalla radice del repository:

```sh
dotnet run --project tests/Mev.ImportRegression
cd mev-governance-ui
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/gare/GareImport.test.js src/pages/GarePage.import.test.js
```

Il test backend crea in memoria un workbook con intestazioni su tre righe, celle unite, offerte economiche e catalogo. Verifica numeri italiani e invarianti, prezzi distinti, null e zero, ID a una cifra, filtro Lotto 1/Lotto 10, risposta vuota, diagnostica delle sintesi AI tramite HTTP simulato e risposte dell'endpoint. Non chiama un servizio AI reale e non modifica il database.

La fixture `Fixtures/encrypted-password.xlsx` è un file pubblico di ExcelDataReader v3.7.0, con password di test `password`, cifrato Agile AES256/SHA512. Verifica apertura e gestione di password mancante/errata; non contiene il foglio di offerta del cliente.
Fonte: https://github.com/ExcelDataReader/ExcelDataReader/blob/v3.7.0/test/Resources/agile_AES256_SHA512_CBC_pwd_password.xlsx
La licenza MIT originale è inclusa in `Fixtures/ExcelDataReader-LICENSE.txt`.

Verificato anche il workbook reale del Lotto 2: 6 TOW, 27 driver e base gara letta dalla nota dopo i dati. RealLayoutRegression riproduce il layout con dati sintetici e verifica descrizioni distinte dagli ambiti, catalogo senza ID, identificatori tecnici stabili e gruppi di prezzi offerti distinti. Il file privato e la sua password non sono inclusi nel repository.

Per verificare le sintesi effettivamente restituite dal servizio AI, nella risposta di `POST /api/gare/analizza-capitolato` controlla `analysis._sectionDiagnostics` (totale, conSintesi, sintesiAssente, sintesiVuota, sintesiNonValida, finishReason), oltre ai singoli campi `analysis.lotti[].sezioni[].sintesi`. Lo schema gara è passato come istruzione al modello, non come vincolo validato dal provider; il prompt da solo non garantisce il campo. Il testo del capitolato inviato all'AI è ridotto dal metodo ExtractRelevantPages: se contiene soltanto un indice per una sezione, non si può ricavare una sintesi attendibile di contenuti non inviati.
