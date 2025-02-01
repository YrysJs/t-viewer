import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NotifierOptions {
  botToken: string;
  chatId: string;
  sendAsFile?: boolean;
  logFilePath?: string;
}

interface ErrorDetails {
  url: string;
  method: string;
  headers: any;
  params: any;
  data: any;
  status: number | string;
  statusText: string;
  responseData: any;
}

class TViewerErrorNotifier {
  private botToken: string;
  private chatId: string;
  private sendAsFile: boolean;
  private logFilePath: string;
  private axiosInstance: AxiosInstance;

  /**
   * Constructor
   * @param options - Configuration options
   * @param options.botToken - Telegram bot token
   * @param options.chatId - Telegram chat or group ID
   * @param options.sendAsFile - Whether to send messages as files (default: false)
   * @param options.logFilePath - Path to the log file (default: './error.log')
   */
  constructor({ botToken, chatId, sendAsFile = false, logFilePath = './error.log' }: NotifierOptions) {
    if (!botToken) {
      throw new Error('botToken is required.');
    }
    if (!chatId) {
      throw new Error('chatId is required.');
    }

    this.botToken = botToken;
    this.chatId = chatId;
    this.sendAsFile = sendAsFile;
    this.logFilePath = logFilePath;

    this.axiosInstance = axios.create();

    this.axiosInstance.interceptors.response.use(
      response => response,
      async (error: AxiosError) => {
        await this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle the error
   * @param error - Axios error object
   */
  async handleError(error: AxiosError): Promise<void> {
    const { config, response } = error;

    const errorDetails: ErrorDetails = {
      url: config?.url || '',
      method: config?.method || '',
      headers: config?.headers || {},
      params: config?.params || {},
      data: config?.data || {},
      status: response ? response.status : 'No response',
      statusText: response ? response.statusText : 'No response',
      responseData: response ? response.data : 'No response',
    };

    if (this.sendAsFile) {
      await this.sendErrorAsFile(errorDetails);
    } else {
      await this.sendErrorMessage(errorDetails);
    }

    this.logError(errorDetails);
  }

  /**
   * Format and send the error message to Telegram
   * @param errorDetails - Error details
   */
  async sendErrorMessage(errorDetails: ErrorDetails): Promise<void> {
    const message = `*Error while requesting the API*\n\n` +
      `*URL:* ${errorDetails.url}\n` +
      `*Method:* ${errorDetails.method}\n` +
      `*Status:* ${errorDetails.status} ${errorDetails.statusText}\n\n` +
      `*Request:* \`\`\`json\n${JSON.stringify({
        headers: errorDetails.headers,
        params: errorDetails.params,
        data: errorDetails.data,
      }, null, 2)}\n\`\`\`\n\n` +
      `*Response:* \`\`\`json\n${JSON.stringify(errorDetails.responseData, null, 2)}\n\`\`\``;

    await this.sendTelegramMessage(message);
  }

  /**
   * Send a text message to Telegram
   * @param message - Message text
   */
  async sendTelegramMessage(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error while sending message to Telegram:', error);
    }
  }

  /**
   * Send the error as a file in Telegram
   * @param errorDetails - Error details
   */
  async sendErrorAsFile(errorDetails: ErrorDetails): Promise<void> {
    const jsonContent = JSON.stringify({
      request: {
        url: errorDetails.url,
        method: errorDetails.method,
        headers: errorDetails.headers,
        params: errorDetails.params,
        data: errorDetails.data,
      },
      response: errorDetails.responseData,
    }, null, 2);

    const filePath = path.join(__dirname, 'error.json');
    fs.writeFileSync(filePath, jsonContent);

    const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;

    const formData = new FormData();
    formData.append('chat_id', this.chatId);
    formData.append('document', fs.createReadStream(filePath));
    formData.append('caption', 'An error occurred while requesting the API');

    try {
      await axios.post(url, formData, {
        headers: formData.getHeaders(),
      });
    } catch (error) {
      console.error('Error while sending file to Telegram:', error);
    } finally {
      fs.unlinkSync(filePath); // Delete the file after sending
    }
  }

  /**
   * Local error logging
   * @param errorDetails - Error details
   */
  logError(errorDetails: ErrorDetails): void {
    const logEntry = `[${new Date().toISOString()}] ${errorDetails.method.toUpperCase()} ${errorDetails.url} - Status: ${errorDetails.status}\n` +
      `Request Data: ${JSON.stringify(errorDetails.data)}\n` +
      `Response Data: ${JSON.stringify(errorDetails.responseData)}\n\n`;

    fs.appendFile(this.logFilePath, logEntry, (err) => {
      if (err) {
        console.error('Error writing to the log file:', err);
      }
    });
  }

  /**
   * Get the configured Axios instance
   * @returns {AxiosInstance}
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

export default TViewerErrorNotifier;
