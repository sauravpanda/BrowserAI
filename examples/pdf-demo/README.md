# PDF Text Extractor Demo

A simple demo application that demonstrates how to extract text from PDF files using the PDF.js library in a browser environment.

## Features

- Upload PDF files via drag-and-drop or file browser
- Extract text content from PDF files
- Display structured information about the PDF (page count, errors)
- Show text content with page numbers

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:

```bash
cd examples/pdf-demo
npm install
```

### Running the Demo

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173` (or the URL shown in your terminal).

## How It Works

This demo uses:

- Vite.js for the development environment
- React for the UI
- PDF.js for parsing PDF files
- TypeScript for type safety

The main PDF parsing functionality is implemented in `src/utils/pdf-parser.ts`, which provides:

- `extractTextFromPdf`: A function to extract plain text from a PDF
- `extractStructuredTextFromPdf`: A function to extract structured information from a PDF

## Usage

1. Click on the upload area or drag and drop a PDF file
2. The application will process the PDF and display the extracted text
3. Document information such as page count will be shown below the text

## License

MIT 