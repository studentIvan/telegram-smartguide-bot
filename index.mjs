import { Telegraf } from "telegraf";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

// Extracting environment variables for API keys
const { TELEGRAM_API_KEY, OPENAI_API_KEY, YANDEX_GEOSUGGEST_API_KEY } = process.env;

// Base URL for Yandex GeoSuggest API
const YANDEX_GEOSUGGEST_API_URL = "https://suggest-maps.yandex.ru/v1/suggest";

// Default user language settings
const USER_LANGUAGE = { code: "ru", name: "Russian" };

// Maximum distance in meters to consider a place as "nearby"
const METERS_LIMIT = 150;

// Flag to enable or disable text-to-speech (TTS) audio responses
const USE_AUDIO_TTS = false;

// Cooldown time in seconds to prevent spamming requests
const COOLDOWN_TIME_IN_SECONDS = 60;

// List of query terms to search for nearby places
const PLACES_SEEKING_MATRIX = ["достопримечательность", undefined, "памятник"];

// Prompt for GPT to filter the list of places for tourists
const FILTER_GPT_PROMPT = `Filter the list of places and provide only the most interesting ones for the tourist.`;

// Prompt for GPT to act as a tour guide and provide detailed information
const GUIDE_GPT_PROMPT = `You are a helpful tour guide.
  Provide the detail information and all gossips, mystical stories (if they exist), etc, about the place that tourist sees.
  Use user's coordinates to only determine the city (but don't tell the city to the user, he already knows), don't guess the exact location using it.
  User tells you what he sees.
  Don't say hello or hi. Just answer the question. It should look like you continue the conversation, not starting.
  For example: "You can see the Eiffel Tower from here. It's a famous landmark in Paris."
`;

if (!TELEGRAM_API_KEY || !OPENAI_API_KEY || !YANDEX_GEOSUGGEST_API_KEY) {
  console.error("Please set TELEGRAM_API_KEY, OPENAI_API_KEY, and YANDEX_GEOSUGGEST_API_KEY environment variables.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bot = new Telegraf(TELEGRAM_API_KEY);
const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const cooldowns = new Map();
const toldPlaces = new Map();

async function fetchNearbyPlaces(longitude, latitude, queryText = undefined) {
  const params = new URLSearchParams({
    lang: USER_LANGUAGE.code,
    highlight: "0",
    ll: `${longitude},${latitude}`,
    spn: "0.003,0.003",
    results: "10",
    strict_bounds: "1",
    apikey: YANDEX_GEOSUGGEST_API_KEY,
  });

  if (queryText) {
    params.append("text", queryText);
  }

  const results = [];
  const apiReq = await fetch(`${YANDEX_GEOSUGGEST_API_URL}?${params.toString()}`).then((r) => r.json());
  
  if (apiReq && apiReq.results) {
    for (const suggestion of apiReq.results) {
      if (suggestion && suggestion.distance.value < METERS_LIMIT) {
        results.push(suggestion);
      }
    }
  }
  return results.sort((a, b) => a.distance.value - b.distance.value); // Sort by distance, closest first
  // return results;
}

/**
 * Processes a user's location and provides information about nearby places.
 *
 * @async
 * @function
 * @param {Object} ctx - The context object from the bot framework, used to interact with the user.
 * @param {Object} location - The location object containing latitude and longitude.
 * @param {number} location.latitude - The latitude of the user's location.
 * @param {number} location.longitude - The longitude of the user's location.
 * 
 * @description
 * This function performs the following steps:
 * 1. Notifies the user that the bot is processing their request.
 * 2. Checks if the user is on cooldown to prevent spamming requests.
 * 3. Fetches nearby places based on predefined query terms.
 * 4. Filters out duplicate places and places already shown to the user.
 * 5. Optionally uses GPT to refine the list of interesting places.
 * 6. Sorts the places by distance and selects the closest one.
 * 7. Provides information about the closest place to the user, either as text or audio.
 * 
 * @throws {Error} If there is an issue with parsing GPT responses or generating audio.
 * 
 * @example
 * // Example usage:
 * const ctx = { /* bot context object *\/ };
 * const location = { latitude: 40.7128, longitude: -74.0060 };
 * await processLocation(ctx, location);
 */
async function processLocation(ctx, location) {
  // Notify the user that the bot is processing their request
  ctx.sendChatAction("typing");

  // Get the user ID from the context
  const userId = ctx.from.id;

  // Get the current timestamp
  const now = Date.now();

  // Check if the message is an edited message (geoposition translation mode)
  const translationGeoMode = Boolean(ctx.update?.edited_message);

  // Check if the user is on cooldown (to prevent spamming requests)
  if (cooldowns.has(userId) && now - cooldowns.get(userId) < COOLDOWN_TIME_IN_SECONDS * 1000) {
    if (!translationGeoMode) {
      // Notify the user to wait if they are not in translation mode
      ctx.reply("Погодь чутка.");
    }
    return;
  }

  // Update the cooldown timestamp for the user
  cooldowns.set(userId, now);

  // Extract latitude and longitude from the location object
  const { latitude, longitude } = location;

  // Define the list of query terms to search for nearby places
  const placesMatrix = PLACES_SEEKING_MATRIX;

  // Initialize an array to store all fetched places
  const places = [];

  // Fetch nearby places for each query term in the matrix
  for (const queryText of placesMatrix) {
    const fetchedPlaces = await fetchNearbyPlaces(longitude, latitude, queryText);
    places.push(...fetchedPlaces);
  }

  // Filter out duplicate places by their title and keep only unique ones
  let uniquePlaces = Array.from(new Map(places.map(place => [place.title.text, place])).values());

  // If no unique places are found, notify the user and exit
  if (uniquePlaces.length === 0) {
    if (!translationGeoMode) {
      ctx.reply("Рядом ничего не знаю.");
    }
    return;
  }

  // Check if the user has a "told places" set initialized
  if (!toldPlaces.has(userId)) {
    // If not, initialize a new set to track places already told to the user
    toldPlaces.set(userId, new Set());
  }

  // Retrieve the set of places already told to the user
  const userToldPlaces = toldPlaces.get(userId);

  /** now filter uniquePlaces by userToldPlaces - uniquePlaces should not have places from it */
  uniquePlaces = uniquePlaces.filter((place) => {
    const placeKey = place.title.text;
    return userToldPlaces.has(placeKey) === false;
  });

  const interestingPlacesResponse = uniquePlaces.length > 1 ? await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${FILTER_GPT_PROMPT}
        Don't explain anything. Answer only JSON in format { "places": <array of places (keep the data format as is)> }`,
      },
      {
        role: "user",
        content: JSON.stringify(uniquePlaces),
      },
    ],
  }) : undefined;

  /** get the gpt filter response json string */
  const interestingPlacesResponseJSON = interestingPlacesResponse?.choices?.at(0)?.message?.content;

  /** parse the gpt filter response */
  let filteredPlaces = [];
  try {
    filteredPlaces = JSON.parse(interestingPlacesResponseJSON).places;
    if (!filteredPlaces.length) {
      filteredPlaces = uniquePlaces;
    }
  }
  catch (error) {
    console.log("Error parsing JSON:", interestingPlacesResponseJSON);
    filteredPlaces = uniquePlaces;
  }

  /** now sort the filtered places again by distance, closest first */
  filteredPlaces.sort((a, b) => a.distance.value - b.distance.value);

  /** pick the first place and put it into the "told" temporary storage per userId */
  const firstPlace = filteredPlaces[0];

  /** do nothing */
  if (!firstPlace) return;

  const placeKey = firstPlace.title.text;
  if (!userToldPlaces.has(placeKey)) {
    userToldPlaces.add(placeKey);
    setTimeout(() => {
      userToldPlaces.delete(placeKey);
    }, 1000 * 60 * 60); // Remove the place after 1 hour
  }
  else {
    if (!translationGeoMode) {
      ctx.reply(`Рядом только ${firstPlace.title.text}, но я тебе уже про него рассказывал.`);
    }
    return;
  }

  const speakingSight = `Мои координаты: lng ${longitude}, lat ${latitude}.
    В ${firstPlace.distance.text} от меня находится ${firstPlace.title.text} (${firstPlace.subtitle.text}).`;
  ctx.sendChatAction("typing");
  
  const response = await client.responses.create({
    model: "gpt-4o",
    instructions: `${GUIDE_GPT_PROMPT}
    Use language: ${USER_LANGUAGE.name}.`,
    input: speakingSight,
  });

  if (!response || !response.output_text) {
    if (!translationGeoMode) {
      ctx.reply(`Рядом ${firstPlace.title.text}. Не могу найти информацию об этом месте.`);
    }
    return;
  }

  const replyWithText = () =>
    ctx.reply(response.output_text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Яндекс: ${firstPlace.title.text}`,
              url: `https://yandex.ru/search/?text=${encodeURIComponent(firstPlace.title.text + " " + firstPlace.subtitle.text)}`,
            },
          ],
        ],
      },
    });

  if (USE_AUDIO_TTS) {
    try {
      ctx.sendChatAction("typing");
      // Get audio using TTS from OpenAI
      const ttsResponse = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy", // Other options: alloy, echo, fable, onyx, shimmer, nova
        input: response.output_text,
        response_format: "mp3", // keep mp3 for Telegram
      });
  
      const filename = `response-${randomBytes(8).toString('hex')}.mp3`;
      const audioPath = path.join(__dirname, filename);
      const audioStream = fs.createWriteStream(audioPath);
      ttsResponse.body.pipe(audioStream);
  
      audioStream.on("finish", async () => {
        try {
          await ctx.replyWithVoice({ source: fs.createReadStream(audioPath) });
        } finally {
          fs.unlink(audioPath, () => {}); // silently delete the temp file
        }
      });
    } catch (err) {
      console.error(err);
      replyWithText();
    }
  } else {
    replyWithText();
  }
}

// Listening for location
bot.on("location", (ctx) => processLocation(ctx, ctx.message.location));

// Listening for the geoposition translation
bot.on("edited_message", (ctx) => {
  if (ctx.update.edited_message.location) {
    processLocation(ctx, ctx.update.edited_message.location);
  }
});

// Error handling
bot.catch(console.error);

// Launch the bot
bot.launch().then(() => {}).catch((error) => {
  console.error("Error launching the bot:", error);
  process.exit(1);
});

// To stop the bot, use Ctrl+C or send SIGINT/SIGTERM signals.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("Bot started. Waiting for the location updates...");
