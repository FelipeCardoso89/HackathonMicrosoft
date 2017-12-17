// This loads the environment variables from the .env file
require('dotenv-extended').load();

const builder = require('botbuilder');
const restify = require('restify');
const Store = require('./store');
const spellService = require('./spell-service');
const http = require('http');
const request = require('superagent');

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
                "Itaú|Bradesco|Banco Original", 
                { listStyle: builder.ListStyle.button }
            );
        } else {
            
        }
    },
    (session, results) => {

        builder.Prompts.choice(
            session, 
            `Ok, vou precisar da sua permissão para accessar o ${results.response.entity}. Tudo bem?`, 
            "Sim|Não", 
            { listStyle: builder.ListStyle.button }
        );
    },
    (session, results) => {

        if (results.response.entity == 'Sim') {
            
            session.send(`Tudo certo! Vou analisar seu consumo e já te digo se esta ok usar esse dinhero.`); 
            session.sendTyping();

            request
                .get('https://sandbox.original.com.br/accounts/v1/balance')
                .set('Content-Type', 'application/json')
                .set('authorization', 'Bearer NDYxODIwMTAtZTMwNC0xMWU3LWE3YzAtMDA1MDU2OWE3MzA1OmV5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUowZVhCbElqb2lUMEYxZEdnaUxDSnBZWFFpT2pFMU1UTTBPVGt6TVRjc0ltVjRjQ0k2TVRVeE16a3pNVE14Tnl3aVlYVmtJam9pTldJMFpqZG1PR1lpTENKcGMzTWlPaUphZFhBdWJXVWdSMkYwWlhkaGVTSXNJbk4xWWlJNklqUTJNVGd5TURFd0xXVXpNRFF0TVRGbE55MWhOMk13TFRBd05UQTFOamxoTnpNd05TSXNJbXAwYVNJNklqUTNORFF4WTJZd0xXVXpNRFF0TVRGbE55MWlZelV4TFRjeE5HUXdZMlkwTWpBeFl5SjkuMkNna1kwMUF3SmlrSGN5eTg3MjRLVk1tVWo3ellSaXdXOVk1OGxxUVRoaw==')
                .set('developer-key', '28f955c90b3a2940134ff1a970050f569a87facf')
                .end((error, response) => {

                    setTimeout(function () {

                        var message = `Seu saldo atual é de ${response.body.current_balance}.`

                        if (response.body.current_balance < 0) {
                            message += `
                            Avaliando seus habitos de consumo, aconselho você a esperar 2 meses antes de tentar investir esse valor. 
                            Esse é o tempo previsto para que suas receitas e despesas se equilibrem sendo suficiente para cobrir seus gastos mais frequentes.
                            `
                        } else if (response.body.current_balance > 2000) {
                            message += `
                            Este valor dividido em 3x não pesa muito no seu orçamento. 
                            Cada parcela representará cerca de 4% dos recursos que você possui despois de
                            quitar todas as suas dispesas que percebi serem fixas.`
                        } else {
                            message += `Fique a vontade para decidir comprar esse produto agora. Você controla muito bem suas finanças.`
                        }
    
                        session.send(message);
                
                        builder.Prompts.choice(
                            session, 
                            `Ver plano de quitação de dívidas? `, 
                            "Sim|Não", 
                            { listStyle: builder.ListStyle.button }
                        );

                    }, 5000);

                });

        } else {
            session.endDialog(`Tudo bem, fique a vontade para voltar quando quizer`); 
        }
    },
    (session, results) => {
        
        if (results.response.entity == 'Não') { 
            session.endDialog(`Tudo bem, fique a vontade para voltar quando quizer`); 
        } 
        
    Store
        .searchHotels("São Paulo")
        .then(hotels => {
            
            let messageTitle = `Temos ${hotels.length} planos de quitação de dívidas que podem te ajudar a positivar suas finanças. Conte conosco para ajuda-lo sempre.`
            session.send(messageTitle);

            let message = new builder.Message()
            .attachmentLayout(builder.AttachmentLayout.carousel)
            .attachments(hotels.map(hotelAsAttachment));
            session.send(message);
            session.endDialog();
        });
    }

]).triggerAction({
    matches: 'Buy',
    onInterrupted:  session => {
        session.send('Please provide a destination');
    }
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
        .subtitle('%d curtidas. %d comentários. A partir de $%d ao mês.', hotel.rating, hotel.numberOfReviews, hotel.priceStarting)
        .images([new builder.CardImage().url(hotel.image)])
        .buttons([
            new builder.CardAction()
                .title('Mais Detalhes')
                .type('openUrl')
                .value('https://www.bing.com/search?q=telecon+in+' + encodeURIComponent(hotel.location))
        ]);
}

const reviewAsAttachment = review => {
    return new builder.ThumbnailCard()
        .title(review.title)
        .text(review.text)
        .images([new builder.CardImage().url(review.image)]);
}