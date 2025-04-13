# telegram-smartguide-bot: Location Guide Bot

This project is a bot designed to provide location-based information and services.
Follow the instructions below to set up the project and obtain the necessary API keys.
Running example https://t.me/smgdbot (can be unavailable sometimes)

## Prerequisites

- Node.js (v18 or higher)
- npm
- A valid API key for the required services

## Obtaining API Keys

The bot requires API keys from the following services:

### 1. TELEGRAM_API_KEY (free)

To obtain a Telegram Bot API key, follow these steps:

1. Open Telegram and search for the "BotFather" user.
2. Start a chat with BotFather and send the command `/newbot`.
3. Follow the instructions to set up your bot, including choosing a name and username for your bot.
4. Once the bot is created, BotFather will provide you with an API key. Copy this key for use in your project.

For more details, refer to the [Telegram Bot API documentation](https://core.telegram.org/bots/api).

### 2. OPENAI_API_KEY (paid)

To obtain an OpenAI API key, follow these steps:

1. Visit the [OpenAI website](https://platform.openai.com/signup/) and sign up for an account if you don't already have one.
2. Log in to your OpenAI account and navigate to the API section of the dashboard.
3. Click on "Create new secret key" to generate a new API key.
4. Copy the generated API key and store it securely. You will not be able to view it again after closing the dialog.

For more details, refer to the [OpenAI API documentation](https://platform.openai.com/docs/).

### 3. YANDEX_GEOSUGGEST_API_KEY (free up to 1000 req/daily)

To obtain a Yandex Geosuggest API key, follow these steps:

1. Visit the [Yandex Developer Console](https://developer.tech.yandex.com/) and sign in with your Yandex account. If you don't have an account, create one.
2. Go to the "API Keys" section, select the [Geosuggest API](https://developer.tech.yandex.ru/services/53).
4. Click on "Create API Key" and follow the instructions to generate a new key.
5. Copy the generated API key and store it securely for use in your project.
6. It may take up to few hours before the recently created key activated.

For more details, refer to the [Yandex Geosuggest API documentation](https://yandex.ru/maps-api/docs/suggest-api/examples.html).

## Setting Up the Project

1. Clone the repository:
    ```bash
    git clone https://github.com/your-username/location-guide-bot.git
    cd location-guide-bot
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Create a `.env` file in the root directory and add your API keys:
    ```env
    TELEGRAM_API_KEY="your-key"
    OPENAI_API_KEY="your-key"
    YANDEX_GEOSUGGEST_API_KEY="your-key"
    ```

4. Start the bot:
    ```bash
    npm start
    ```

## Contributing

Feel free to submit issues or pull requests to improve the project.

## License

This project is licensed under the MIT License.  