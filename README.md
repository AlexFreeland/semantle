# Introduction

So [Wordle](https://www.wordleunlimited.com/) is kind of fun... for about ten minutes, after which point the only way the player hasn't figured out how to consistently beat it is if they have either the vocabulary or the tactical skills of an infant.  Enter [Semantle](https://semantle.novalis.org/), a much better (and much harder) game created by David Turner, where the aim is to determine the target word by asking how well it aligns *semantically* with your guesses.  Hence, presumably, the name.  Anyway this is all very cool, but there are a couple of minor things about it which bug me, to wit:
1. You're limited to playing a single round per day, and
2. ~~It's not open source~~ [Now open source!](https://gitlab.com/novalis_dt/semantle)

And by now you can probably infer why this repository exists.

# Disclaimer

You probably shouldn't run this on a publicly accessible address.  It's not really built for that; I was, frankly, more interested in building a game than a webserver.  There's no TLS, very little validation of user input, extremely minimal protection against flooding... and probably a whole host of other issues which I'm not even aware of.  I'm not a web developer by any stretch of the imagination; in fact I have treated this project mostly as an exercise in learning modern JS (which is why it probably looks very much like the last ten years have thrown up all over the codebase.)

So, yeah: run it locally.  Maybe give a few friends access, if they're not dicks.

# Prerequisites

First of all, you'll need [Node](https://nodejs.org).  I'm running v17.5.0; I haven't tested it on any older releases, and I'm not going to, so I have no idea what the minimum requirement is.  It does use a method introduced in v15.6.0, though, so definitely don't bother trying anything older than that.

Next you'll need some word vectors.  I use Google's [word2vec](https://code.google.com/archive/p/word2vec/) data, but the code should be capable of ingesting anything with the same format, namely:
- A header line: string representations of the number `n` and dimension `d` of the vectors in the file, separated by a space, and then
- `n` vector entries: the string to which the vector corresponds, then a space, then `d` IEEE 754 float values which comprise the vector itself

Now we can use cosine similarity to figure out how alike words are to other words!  Except the vector file, in addition to words, contains a lot of what might charitably be termed "absolute fucking horse shit" and so we employ a list of actual english* words to pare it down.  I'm using `words_alpha.txt` from [here](https://github.com/dwyl/english-words) -- it has about 370,000 words in it.  That ought to be enough to be getting on with.

*Or, you know: whatever language your vector data is in

# Configuration

You can set various configuration options for the game by modifying [config.json](config.json).  These should hopefully be pretty self-explanatory, but I'll briefly address some of the less obvious ones:
- dictionary:
  - maxHeaderSize: the maximum number of bytes the program will read when attempting to parse the header line in the word vector file before it assumes something is fucky and gives up
  - bufferSize: the buffer size to use when parsing the dictionary file; the default value of 64kB is chosen to match that of fs.ReadStream
- game:
  - rngSalt: a custom string which is concatenated with the current date and used to seed the random number generator for word selection.  This means you can run separate instances of the game with the same salt and all will yield the same target words (e.g. if you want to compete with your friends but can't/won't all have access to the same instance)
  - dailyWords: the maximum number of target words which will be generated per day.  You can specify 0 to make it unlimited, but be aware that players can then hammer that mf "Next Word" button with reckless abandon and peg your CPU
  - precacheWords: the number of words ahead of the leading player which the game will attempt to precompute the top similarity list for.  Since that calculation can take tens of seconds per word, it's a good idea from a usability standpoint to specify at least 1 here as it avoids players having to wait for it to finish before they can make guesses on a new word

# Usage

After everything else is set up you should be able to simply run `node src/main.mjs` from the repository root to kick off the server's initialization process.  This can take something on the order of tens of seconds, depending on the hardware and the dictionary/word vectors you're using (and this process happens **every** time -- caching the index which the code builds may be on the cards for a future update.)  Eventually it should tell you that the http server is running, at which point you can open it in your browser of choice* and start playing.

*But please note that I have only tested it on desktop Firefox

# Acknowledgements

- David Turner, for creating the original version of Semantle
- Google, for doing the hard work of word embedding ~~and not being evil~~
- dwyl (if that is your real name) for that stonking great list of words
- [https://favicon.io/](https://favicon.io/) for the snazzy favicon