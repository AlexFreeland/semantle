const xhrError = '{xhrError}';
const sseError = '{sseError}';

var user;

function handleError(error)
{
    displayResponse({status: 'NOK', message: error});
}

function watchInput()
{
    let txtWord = document.getElementById('txtWord');
    txtWord.onkeyup = (event) =>
    {
        clearResponse();
        if (event.key == 'Enter')
        {
            document.getElementById('btnGuess').click();
        }
        txtWord.onkeyup = null;
    };
}

function formatSimilarity(similarity)
{
    return similarity.toFixed(3);
}

function clearResponse()
{
    let messageContainer = document.getElementById('message');
    messageContainer.innerText = '';
}

function displayResponse(response)
{
    let messageContainer = document.getElementById('message');
    switch (response.status)
    {
        case 'NOK':
            messageContainer.style = 'color: #FF0000';
            break;
        case 'WIN':
            messageContainer.style = 'color: #007700';
            break;
        default:
            messageContainer.style = 'color: #000000';
            break;
    }
    messageContainer.innerText = response.message;
    document.getElementById('txtWord').select();
}

function addGuess(guess)
{
    if (user.guesses.indexOf(guess) == -1)
    {
        user.guesses.push(guess);
        updateScore();
    }

    let historyTable = document.getElementById('history');
    let rows = Array.from(historyTable.rows);

    let lastGuess = rows[1];
    if (lastGuess)
    {
        if (lastGuess.cells[1].innerText == guess.word)
        {
            return;
        }
        else
        {
            lastGuess.style = '';

            let nextRow = rows.slice(2).find((row) => parseFloat(row.cells[2].innerText) <= parseFloat(lastGuess.cells[2].innerText));
            lastGuess.parentNode.insertBefore(lastGuess, nextRow);
        }
    }
    //Rebuild the array of rows since they have shifted around
    rows = Array.from(historyTable.rows);

    let row = rows.slice(1).find((row) => row.cells[1].innerText == guess.word);
    if (row)
    {
        row.parentNode.insertBefore(row, rows[1]);
    }
    else
    {
        row = historyTable.insertRow(1);
        row.insertCell(0).innerText = rows.length;
        row.insertCell(1).innerText = guess.word;
        row.insertCell(2).innerText = formatSimilarity(guess.score.similarity);
        if (guess.score.rank == 0)
        {
            row.insertCell(3).innerText = 'Found!';
        }
        else
        {
            row.insertCell(3).innerText = guess.score.rank ?? '2000+';
        }
    }
    row.style = 'color: #ff0077;';
}

function rebuildHistory()
{
    let historyTable = document.getElementById('history');
    while (historyTable.rows.length > 1)
    {
        historyTable.deleteRow(1);
    }

    for (let i = 0; i < user.guesses.length; i++)
    {
        addGuess(user.guesses[i]);
    }
}

function updateScore()
{
    let scoreContainer = document.getElementById('scoreInfo');
    let wordScore = user.guesses.length > 0 ? Math.max(...user.guesses.map(guess => guess.score.points)) : 0;
    scoreContainer.innerHTML = `Your current score for this word is <b>${wordScore}/1000</b> (total: <b>${wordScore + user.score}</b>)`;
}

async function initialize()
{
    let userSocket = new EventSource('/user');
    userSocket.addEventListener('joinGame', (msg) =>
    {
        try
        {
            user = JSON.parse(msg.data);

            document.cookie = `user_id=${user.id}; SameSite=Strict`;
            updateGameInfo();
        }
        catch (error)
        {
            handleError(error);
        }
    });
    userSocket.addEventListener('makeGuess', (msg) =>
    {
        try
        {
            let guess = JSON.parse(msg.data);
            addGuess(guess);
        }
        catch (error)
        {
            handleError(error);
        }
    });
    userSocket.onerror = () => handleError(sseError);
}

async function updateGameInfo()
{
    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('GET', 'game', true);
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send();
    }).then((res) =>
    {
        let game = JSON.parse(res);

        if (game.gameID != user.gameID || game.wordID != user.wordID)
        {
            //console.log('Ignoring stale game update');
            return;
        }

        let infoContainer = document.getElementById('gameInfo');
        infoContainer.innerHTML = `Hello, <b>${user.name}</b> (<a href="#" onclick="setName()">click here to change your name</a>)`;
        infoContainer.innerHTML += `<br/>Welcome to game <b>"${game.gameID}"</b>`;
        infoContainer.innerHTML += `<br/><br/>You are currently guessing word <b>${game.wordID + 1}/${game.maxWords}</b>.`;
        if (game.lastWord)
        {
            infoContainer.innerHTML += `  The previous word was <b>${game.lastWord}</b>.`;
        }
        infoContainer.innerHTML += '<br/><div id="targetInfo">Please wait while the server fetches some info about the target word...<br/>If this takes more than a couple of seconds then it most likely means you\'re the first player to reach this word.<br/>Give yourself a pat on the back while you wait.</div>';

        updateScore();
        rebuildHistory();

        updateTargetInfo();
    }).catch(handleError);
}

async function updateTargetInfo()
{
    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('GET', 'target', true);
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send();
    }).then((res) =>
    {
        let target = JSON.parse(res);
        
        if (target.gameID != user.gameID || target.wordID != user.wordID)
        {
            //console.log('Ignoring stale target update');
            return;
        }
        
        let infoContainer = document.getElementById('targetInfo');
        if (target.expired)
        {
            infoContainer.innerHTML = `This game has ended.  Please click "Next Word" when you are ready to advance to the current one.`;
            return;
        }
        infoContainer.innerHTML = `The closest word to the target has a similarity of <b>${formatSimilarity(target.similarity1)}</b>`;
        infoContainer.innerHTML += `<br/>The tenth closest word has a similarity of <b>${formatSimilarity(target.similarity10)}</b>`;
        infoContainer.innerHTML += `<br/>The hundredth closest word has a similarity of <b>${formatSimilarity(target.similarity100)}</b>`;
        infoContainer.innerHTML += `<br/>The thousandth closest word has a similarity of <b>${formatSimilarity(target.similarity1000)}</b>`;
    }).catch(handleError);
}

async function setName()
{
    let name = prompt("What would you like to be known as?", user.name);
    if (!name)
    {
        return;
    }

    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('POST', 'setName', true);
        http.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send(JSON.stringify({'name': name}));
    }).then((res) =>
    {
        let response = JSON.parse(res);
        displayResponse(response);
    }).catch(handleError);
}

async function guess()
{
    let word = document.getElementById('txtWord').value.trim();
    
    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('POST', 'guess', true);
        http.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send(JSON.stringify({'word': word.toLowerCase()}));
    }).then((res) =>
    {
        let response = JSON.parse(res);
        displayResponse(response);
    }).catch(handleError);
}

async function next()
{
    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('GET', 'next', true); //TODO: This should really be a POST, since it alters the state on the server.  Maybe pass in current game/word ID to ensure things are in sync/avoid inadvertent skipping of words
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send();
    }).then((res) =>
    {
        let result = JSON.parse(res);
        if (result.success === false)
        {
            displayResponse({status: 'NOK', message: 'Sorry, you have reached the end of today\'s words.  Please try again tomorrow.'});
        }
    }).catch(handleError);
}

async function populateLeaderboard()
{
    await new Promise((resolve, reject) =>
    {
        let http = new XMLHttpRequest();
        http.open('GET', 'scores', true);
        http.onload = () => resolve(http.response);
        http.onerror = () => reject(xhrError);
        http.send();
    }).then((res) =>
    {
        let users = JSON.parse(res);

        for (let user of users)
        {
            let leaderboard = document.getElementById('leaderboard');
            let row = leaderboard.insertRow();
            row.insertCell(0).innerText = user.name;
            row.insertCell(1).innerText = user.score;
            if (user.isYou)
            {
                row.style = 'background: #ffff00';
            }
        }
    }).catch(alert);    //TODO: probably not this
}