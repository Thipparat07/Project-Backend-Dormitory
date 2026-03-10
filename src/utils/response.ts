type Message = {
    th: string;
    en: string;
};

export class ResponseTemplate {

    static success(message: Message, data?: any) {
        const response: any = {
            status: 'success',
            message: {
                th: message.th,
                en: message.en
            },
            timestamp: new Date().toISOString()
        };

        if (data !== undefined) {
            response.data = data;
        }

        return response;
    }

    static error(message: Message, code?: string, data?: any) {
        const response: any = {
            status: 'error',
            message: {
                th: message.th,
                en: message.en
            },
            timestamp: new Date().toISOString()
        };

        if (code) {
            response.code = code;
        }

        if (data !== undefined) {
            response.data = data;
        }

        return response;
    }

}