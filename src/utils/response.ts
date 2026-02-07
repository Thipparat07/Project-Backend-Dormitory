type Message = {
    th: string;
    en: string;
};

export class ResponseTemplate {
    static success(message: Message, data?: any) {
        return {
            status: 'success',
            message: {
                th: message.th,
                en: message.en
            },
            timestamp: new Date().toISOString(),
            data
        };
    }

    static error(message: Message, data?: any) {
        return {
            status: 'error',
            message: {
                th: message.th,
                en: message.en
            },
            timestamp: new Date().toISOString(),
            data
        };
    }
}
