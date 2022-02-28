import dictionary from './dictionary.mjs';
import rng from './rng.mjs';
import userManager from './userManager.mjs';

var config;

var getCurrentGame = function() //NOTE: Black magic w/ closure to hide the internal state which we don't want to accidentally touch.  Should probably just be another module tbh
{
    var currentID;
    var currentRNG;
    var currentTargets;

    return () =>
    {
        let currentDate = new Date();
        let dateString = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
        let gameID = `${config.game.rngSalt}:${dateString}`;

        if (currentID != gameID)
        {
            currentID = gameID;
            currentRNG = rng.createRNG(gameID);
            currentTargets = [];
        }

        return { id: currentID, rng: currentRNG, targets: currentTargets };
    };
}();

function getTarget(game, id)    //TODO: precache tomorrow's targets
{
    if (config.game.dailyWords > 0 && id >= config.game.dailyWords)
    {
        return null;
    }

    let wordList;
    while (game.targets.length <= id + config.game.precacheWords)
    {
        wordList = wordList || dictionary.getWordList();

        let index = Math.floor(game.rng() * (wordList.length + 1));
        let word = wordList[index];
        game.targets.push(
        {
            word: word,
            nearby: dictionary.getTopSimilarity(word)
        });

        console.log(`${game.id}:${game.targets.length} is ${word}`);
    }

    return game.targets[id];
}

async function initialize(_config)
{
    config = _config;

	let indexingStartTime = new Date();
	console.log('Initializing word index...');
	await dictionary.buildIndex(config.dictionary);
	console.log(`Word indexing finished after ${new Date() - indexingStartTime}ms.`);

    getTarget(getCurrentGame(), 0);
}

async function initUser(userID)
{
    return await userManager.getUser(userID) || await userManager.createUser(getCurrentGame().id, 0);
}

async function getGameInfo(userID)
{
    let game = {};

    let user = await userManager.getUser(userID);
    if (!user)
    {
        return config.strings.unknownUser;
    }

    game.gameID = user.gameID;
    game.wordID = user.wordID;
    game.maxWords = config.game.dailyWords || '∞';

    let currentGame = getCurrentGame();
    if (game.gameID == currentGame.id && game.wordID > 0)
    {
        game.lastWord = await getTarget(currentGame, game.wordID - 1).word;
    }

    return game;
}

async function getTargetInfo(userID)
{
    let target = {};

    let user = await userManager.getUser(userID);
    if (!user)
    {
        return config.strings.unknownUser;
    }
    
    target.gameID = user.gameID;
    target.wordID = user.wordID;
    
    let currentGame = getCurrentGame();
    if (user.gameID != currentGame.id)
    {
        target.expired = true;
        return target;
    }

    let topWords = await getTarget(currentGame, user.wordID).nearby;
    target.similarity1000 = topWords[999].similarity;
    target.similarity100 = topWords[99].similarity;
    target.similarity10 = topWords[9].similarity;
    target.similarity1 = topWords[0].similarity;

    return target;
}

async function guess(userID, word)
{
    let response = {};

    let user = await userManager.getUser(userID);
    if (!user)
    {
        response.message = config.strings.unknownUser;
        response.status = 'NOK';
        return response;
    }

    let currentGame = getCurrentGame();
    if (user.gameID != currentGame.id)
    {
        response.message = config.strings.expiredGame.replace('{oldGame}', user.gameID).replace('{newGame}', currentGame.id);
        response.status = 'NOK';
        return response;
    }

    if (word.length == 0)
    {
        response.message = config.strings.emptyWord;
        response.status = 'NOK';
        return response;
    }
    if (word.includes(' '))
    {
        response.message = config.strings.multipleWords;
        response.status = 'NOK';
        return response;
    }

    let target = getTarget(currentGame, user.wordID);
    
    let guess = user.guesses.find((guess) => guess.word == word) || {word: word};
    if (word == target.word)
    {
        response.message = config.strings.correctGuess;
        response.status = 'WIN';
    
        guess.score = {similarity: 1, rank: 0};
    }
    else if (guess.score)
    {
        response.message = config.strings.repeatGuess;
        response.status = 'OK';
    }
    else
    {
        guess.score = {similarity: await dictionary.getSimilarity(target.word, word)};
        if (guess.score.similarity == null)
        {
            response.message = config.strings.unknownWord.replace('{word}', word);
            response.status = 'NOK';
        }
        else
        {
            response.message = '';
            response.status = 'OK';

            //TODO: defer this until after returning response to user?
            //      what would that look like exactly?  still won't get visual feedback until the promise fulfills so functionally equivalent really
            //      maybe just add a spinner or something on the client side to provide interim feedback
            let topWords = await target.nearby;
            let wordRank = topWords.findIndex(value => value.word == word);
            if (wordRank != -1)
            {
                guess.score.rank = wordRank + 1;
            }
            //====
        }
    }
    if (response.status != 'NOK')
    {
        guess.score.points = (guess.score.rank !== undefined) ? Math.round(1000 / (guess.score.rank + 1)) : 0;
        user.makeGuess(guess);
    }
    return response;
}

async function advanceUser(userID)
{
    let user = await userManager.getUser(userID);
    if (!user)
    {
        return config.strings.unknownUser;
    }

    let currentGame = getCurrentGame();
    if (user.gameID != currentGame.id)
    {
        await user.joinGame(currentGame.id);
        return { success: true };
    }

    if (config.game.dailyWords == 0 || user.wordID < config.game.dailyWords - 1)
    {
        await user.nextWord();
        return { success: true };
    }
    else
    {
        return { success: false };
    }
}

async function setUserName(userID, name)
{
    let user = await userManager.getUser(userID);
    if (!user)
    {
        return {status: 'NOK', message: config.strings.unknownUser};
    }

    if (!name || !(name = name.trim()))
    {
        return {status: 'NOK', message: config.strings.emptyName};
    }
    if (name.length > config.user.nameMaxLength)
    {
        return {status: 'NOK', message: config.strings.longName.replace('{maxLength}', config.user.nameMaxLength)};
    }
    if (name.match(/[^a-zA-Z0-9'"\-_\.,\?! ]/))
    {
        return {status: 'NOK', message: config.strings.illegalChars};
    }
    
    user.name = name;

    return {status: 'OK', message: ''};
}

async function getLeaderboard(userID)
{
    let allUsers = await userManager.getAllUsers();
    let output = allUsers.map((user) => ({ name: user.name, score: user.score + user.pendingScore, isYou: user.id == userID }));
    return output.sort((a, b) => b.score - a.score);
}

export default
{
    initialize,
    initUser,
    getGameInfo,
    getTargetInfo,
    guess,
    advanceUser,
    setUserName,
    getLeaderboard
}