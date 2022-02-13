import events from 'events';

export default class User
{
    static fromJSON(json)
    {
        let user = new User();
        user.#state = JSON.parse(json);
        return user;
    }

    #state;
    #eventEmitter;

    get id() { return this.#state.id; }
    get name() { return this.#state.name; }
    get gameID() { return this.#state.gameID; }
    get wordID() { return this.#state.wordID; }
    get guesses() { return [...this.#state.guesses]; }
    get score() { return this.#state.score; }
    get pendingScore() { return this.#state.guesses.length > 0 ? Math.max(...this.#state.guesses.map(guess => guess.score.points)) : 0; }   //TODO: DRY?
    get eventEmitter() { return this.#eventEmitter; }

    set name(name)
    {
        this.#state.name = name;

        this.#eventEmitter.emit('stateChange', this);
        this.#eventEmitter.emit('joinGame', this);
    }

    constructor(id, gameID, wordID)
    {
        this.#state = {};
        this.#state.id = id;
        this.#state.name = 'new player';
        this.#state.gameID = gameID;
        this.#state.wordID = wordID;
        this.#state.guesses = [];
        this.#state.score = 0;

        this.#eventEmitter = new events.EventEmitter();
    }

    joinGame(gameID)
    {
        this.#state.gameID = gameID;
        this.#state.wordID = 0;
        this.#state.score += this.pendingScore;
        this.#state.guesses = [];

        this.#eventEmitter.emit('stateChange', this);
        this.#eventEmitter.emit('joinGame', this);
    }

    nextWord()
    {
        this.#state.wordID++;
        this.#state.score += this.pendingScore;
        this.#state.guesses = [];

        this.#eventEmitter.emit('stateChange', this);
        this.#eventEmitter.emit('joinGame', this);
    }

    makeGuess(guess)
    {
        if (!this.#state.guesses.find(g => g.word == guess.word))
        {
            this.#state.guesses.push(guess);
        }
        
        this.#eventEmitter.emit('stateChange', this);
        this.#eventEmitter.emit('makeGuess', guess);
    }

    toJSON()
    {
        return JSON.stringify(this.#state);
    }
}