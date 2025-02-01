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
   * Конструктор
   * @param options - Настройки
   * @param options.botToken - Токен Telegram-бота
   * @param options.chatId - ID чата или группы в Telegram
   * @param options.sendAsFile - Отправлять ли сообщения как файлы (по умолчанию: false)
   * @param options.logFilePath - Путь к файлу для логирования (по умолчанию: './error.log')
   */
  constructor({ botToken, chatId, sendAsFile = false, logFilePath = './error.log' }: NotifierOptions) {
    if (!botToken) {
      throw new Error('botToken обязателен для настройки.');
    }
    if (!chatId) {
      throw new Error('chatId обязателен для настройки.');
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
   * Обработка ошибки
   * @param error - Объект ошибки Axios
   */
  async handleError(error: AxiosError): Promise<void> {
    const { config, response } = error;

    const errorDetails: ErrorDetails = {
      url: config?.url || '',
      method: config?.method || '',
      headers: config?.headers || {},
      params: config?.params || {},
      data: config?.data || {},
      status: response ? response.status : 'Нет ответа',
      statusText: response ? response.statusText : 'Нет ответа',
      responseData: response ? response.data : 'Нет ответа',
    };

    if (this.sendAsFile) {
      await this.sendErrorAsFile(errorDetails);
    } else {
      await this.sendErrorMessage(errorDetails);
    }

    this.logError(errorDetails);
  }

  /**
   * Форматирование и отправка сообщения об ошибке в Telegram
   * @param errorDetails - Детали ошибки
   */
  async sendErrorMessage(errorDetails: ErrorDetails): Promise<void> {
    const message = `*Ошибка при запросе к API*\n\n` +
      `*URL:* ${errorDetails.url}\n` +
      `*Метод:* ${errorDetails.method}\n` +
      `*Статус:* ${errorDetails.status} ${errorDetails.statusText}\n\n` +
      `*Запрос:* \`\`\`json\n${JSON.stringify({
        headers: errorDetails.headers,
        params: errorDetails.params,
        data: errorDetails.data,
      }, null, 2)}\n\`\`\`\n\n` +
      `*Ответ:* \`\`\`json\n${JSON.stringify(errorDetails.responseData, null, 2)}\n\`\`\``;

    await this.sendTelegramMessage(message);
  }

  /**
   * Отправка текстового сообщения в Telegram
   * @param message - Текст сообщения
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
      console.error('Ошибка при отправке сообщения в Telegram:', error);
    }
  }

  /**
   * Отправка ошибки как файла в Telegram
   * @param errorDetails - Детали ошибки
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
    formData.append('caption', 'Произошла ошибка при запросе к API');

    try {
      await axios.post(url, formData, {
        headers: formData.getHeaders(),
      });
    } catch (error) {
      console.error('Ошибка при отправке файла в Telegram:', error);
    } finally {
      fs.unlinkSync(filePath); // Удаляем файл после отправки
    }
  }

  /**
   * Локальное логирование ошибки
   * @param errorDetails - Детали ошибки
   */
  logError(errorDetails: ErrorDetails): void {
    const logEntry = `[${new Date().toISOString()}] ${errorDetails.method.toUpperCase()} ${errorDetails.url} - Status: ${errorDetails.status}\n` +
      `Request Data: ${JSON.stringify(errorDetails.data)}\n` +
      `Response Data: ${JSON.stringify(errorDetails.responseData)}\n\n`;

    fs.appendFile(this.logFilePath, logEntry, (err) => {
      if (err) {
        console.error('Ошибка при записи в лог файл:', err);
      }
    });
  }

  /**
   * Получение настроенного экземпляра Axios
   * @returns {AxiosInstance}
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

export default TViewerErrorNotifier;
