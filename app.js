// This loads the environment variables from the .env file
require('dotenv-extended').load();

const builder = require('botbuilder');
const restify = require('restify');
const Store = require('./store');
const spellService = require('./spell-service');

// Setup Restify Server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});
// Create connector and listen for messages
const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
server.post('/api/messages', connector.listen());


// Default store: volatile in-memory store - Only for prototyping!
var inMemoryStorage = new builder.MemoryBotStorage();
var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
}).set('storage', inMemoryStorage); // Register in memory storage


// You can provide your own model by specifing the 'LUIS_MODEL_URL' environment variable
// This Url can be obtained by uploading or creating your model from the LUIS portal: https://www.luis.ai/
const recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(recognizer);

bot.dialog('Buy', [
    (session, args, next) => {
        
        const ammountEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Ammount');
        const bankEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Bank');

        if (!bankEntity) {
            builder.Prompts.choice(
                session, 
                `De qual de suas contas você quer esses ${ammountEntity.entity}?`, 
                "Banco do Brasil|Bradesco|Banco Original", 
                { listStyle: builder.ListStyle.button }
            );
        }

    },
    (session, results) => {
        const bank = results.response;
        session.send(`Ok, vou dar uma olhada no ${bank.entity}`);
    }

]).triggerAction({
    matches: 'Buy',
    onInterrupted:  session => {
        session.send('Please provide a destination');
    }
});

bot.dialog('ShowHotelsReviews', (session, args) => {
    // retrieve hotel name from matched entities
    const hotelEntity = builder.EntityRecognizer.findEntity(args.intent.entities, 'Hotel');
    if (hotelEntity) {
        session.send(`Looking for reviews of '${hotelEntity.entity}'...`);
        Store
            .searchHotelReviews(hotelEntity.entity)
            .then(reviews => {
                let message = new builder.Message()
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments(reviews.map(reviewAsAttachment));
                session.endDialog(message);
            });
    }
}).triggerAction({
    matches: 'ShowHotelsReviews'
});

bot.dialog('Help', session => {
    session.endDialog(`Hi! Try asking me things like 'search hotels in Seattle', 'search hotels near LAX airport' or 'show me the reviews of The Bot Resort'`);
}).triggerAction({
    matches: 'Help'
});

// Spell Check
if (process.env.IS_SPELL_CORRECTION_ENABLED === 'true') {
    bot.use({
        botbuilder: (session, next) => {
            spellService
                .getCorrectedText(session.message.text)
                .then(text => {
                    session.message.text = text;
                    next();
                })
                .catch(error => {
                    console.error(error);
                    next();
                });
        }
    });
}

// Helpers
const hotelAsAttachment = hotel => {
    return new builder.HeroCard()
        .title(hotel.name)
        .subtitle('%d stars. %d reviews. From $%d per night.', hotel.rating, hotel.numberOfReviews, hotel.priceStarting)
        .images([new builder.CardImage().url(hotel.image)])
        .buttons([
            new builder.CardAction()
                .title('More details')
                .type('openUrl')
                .value('https://www.bing.com/search?q=hotels+in+' + encodeURIComponent(hotel.location))
        ]);
}

const reviewAsAttachment = review => {
    return new builder.ThumbnailCard()
        .title(review.title)
        .text(review.text)
        .images([new builder.CardImage().url(review.image)]);
}
