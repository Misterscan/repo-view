import { type Request, type Response, type Express } from 'express';
import { GoogleGenAI } from '@google/genai';

import { json } from './auth';

export function getGeminiClient(geminiApiKey: string) {
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  return new GoogleGenAI({ apiKey: geminiApiKey });
}

export async function uploadBufferToGemini(geminiApiKey: string, name: string, mimeType: string, data: Buffer) {
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const baseUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
  const startResp = await fetch(`${baseUrl}?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': data.byteLength.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name } }),
  });

  if (!startResp.ok) {
    throw new Error(`Upload start failed with status ${startResp.status}`);
  }

  const uploadUrl = startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('No upload URL returned.');
  }

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': mimeType,
    },
    body: new Uint8Array(data),
  });

  if (!uploadResp.ok) {
    throw new Error(`Upload failed with status ${uploadResp.status}`);
  }

  const fileInfo = await uploadResp.json();
  return fileInfo.file?.uri;
}

export function registerGeminiRoutes(app: Express, geminiApiKey: string) {
  app.post('/api/gemini/embed', async (req: Request, res: Response) => {
    try {
      const { model, contents } = req.body || {};
      if (!model || !Array.isArray(contents)) {
        json(res, 400, { error: 'model and contents are required.' });
        return;
      }

      const result = await getGeminiClient(geminiApiKey).models.embedContent({ model, contents });
      json(res, 200, { embeddings: result.embeddings ?? [] });
    } catch (error: any) {
      console.error('Gemini embed error:', error);
      json(res, 500, { error: error.message || 'Failed to embed content.' });
    }
  });

  app.post('/api/gemini/generate', async (req: Request, res: Response) => {
    try {
      const { model, contents, config } = req.body || {};
      if (!model || !contents) {
        json(res, 400, { error: 'model and contents are required.' });
        return;
      }

      const result = await getGeminiClient(geminiApiKey).models.generateContent({ model, contents, config });
      json(res, 200, { text: result.text || '' });
    } catch (error: any) {
      console.error('Gemini generate error:', error);
      json(res, 500, { error: error.message || 'Failed to generate content.' });
    }
  });

  app.post('/api/gemini/countTokens', async (req: Request, res: Response) => {
    try {
      const { model, contents, config } = req.body || {};
      if (!model || !contents) {
        json(res, 400, { error: 'model and contents are required.' });
        return;
      }

      // Gemini countTokens API does not support systemInstruction or tools in the config.
      // We must move systemInstruction to contents if present.
      const processedContents = [...contents];
      if (config?.systemInstruction?.parts) {
        processedContents.unshift({
          role: 'user',
          parts: config.systemInstruction.parts
        });
      }

      const result = await getGeminiClient(geminiApiKey).models.countTokens({ 
        model, 
        contents: processedContents, 
        config: { ...config, systemInstruction: undefined, tools: undefined } 
      });
      json(res, 200, { totalTokens: result.totalTokens });
    } catch (error: any) {
      console.error('Gemini countTokens error:', error);
      json(res, 500, { error: error.message || 'Failed to count tokens.' });
    }
  });

  app.post('/api/gemini/upload', async (req: Request, res: Response) => {
    try {
      const { name, mimeType, data } = req.body || {};
      if (!name || !mimeType || !data) {
        json(res, 400, { error: 'name, mimeType, and data are required.' });
        return;
      }

      const uri = await uploadBufferToGemini(geminiApiKey, name, mimeType, Buffer.from(data, 'base64'));
      json(res, 200, { uri });
    } catch (error: any) {
      console.error('Gemini upload error:', error);
      json(res, 500, { error: error.message || 'Failed to upload file.' });
    }
  });
}
