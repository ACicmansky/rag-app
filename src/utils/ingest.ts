'use server';

import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { BaseDocumentLoader } from "langchain/document_loaders/base";
import { TextLoader } from "langchain/document_loaders/fs/text";

import { addDocuments } from "@/lib/vector-store";

export type SupportedFileType = 'pdf' | 'docx' | 'txt';

interface IngestConfig {
  chunkSize?: number;
  chunkOverlap?: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

const getFileExtension = (filename: string): SupportedFileType | null => {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' || extension === 'docx' || extension === 'txt') {
    return extension as SupportedFileType;
  }
  return null;
};

const getLoader = async (input: string | File | Blob): Promise<BaseDocumentLoader> => {
  let extension: SupportedFileType | null;
  
  if (input instanceof File || input instanceof Blob) {
    extension = getFileExtension(input instanceof File ? input.name : 'document.pdf');
    
    switch (extension) {
      case 'pdf':
        return new WebPDFLoader(input);
      case 'docx':
        throw new Error('DOCX files are not supported in browser environment yet');
      case 'txt':
        return new TextLoader(input);
      default:
        throw new Error(`Unsupported file type. Supported types are: pdf, txt`);
    }
  } else {
    extension = getFileExtension(input);
    
    switch (extension) {
      case 'pdf':
        return new PDFLoader(input);
      case 'docx':
        return new DocxLoader(input);
      case 'txt':
        return new TextLoader(input);
      default:
        throw new Error(`Unsupported file type. Supported types are: pdf, docx, txt`);
    }
  }
};

export async function ingestDocument(
  input: string | File | Blob,
  config: IngestConfig = {}
): Promise<{ success: boolean; message: string; chunks?: Document[] }> {
  try {
    // Validate input
    if (!input) {
      throw new Error('Input is required');
    }

    // Get appropriate loader based on input type
    const loader = await getLoader(input);
    
    // Load document
    const rawDocs = await loader.load();
    
    if (!rawDocs.length) {
      throw new Error('No content found in document');
    }

    // Create text splitter with provided config or defaults
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize || DEFAULT_CHUNK_SIZE,
      chunkOverlap: config.chunkOverlap || DEFAULT_CHUNK_OVERLAP,
    });

    // Split documents into chunks
    const finalChunks = await splitter.splitDocuments(rawDocs);

    if (!finalChunks.length) {
      throw new Error('Failed to split document into chunks');
    }

    // Store chunks in vector store
    await addDocuments(finalChunks);

    return {
      success: true,
      message: `Successfully processed document with ${finalChunks.length} chunks`,
      chunks: finalChunks,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      message: `Failed to process document: ${errorMessage}`,
    };
  }
}
