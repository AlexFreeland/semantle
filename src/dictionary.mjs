import fs from 'fs';

const cacheDirectory = 'data/similarity/';

var wordVectorFile;
var wordIndex;
var vectorSize;

function loadDictionary(config)
{
	let dictionaryWords = new Set();
	let dictionaryFD = fs.openSync(config.dictionaryFilename, 'r');
	
	let buffer = Buffer.alloc(config.bufferSize);
	let scanPos = 0;
	let currentWord = [];
	let bytesRead;
	//NOTE: I know this looks like reinventing the wheel but it's actually much faster than
	//		using an fs.ReadStream owing to the overhead of the latter's callbacks
	while ((bytesRead = fs.readSync(dictionaryFD, buffer, 0, buffer.length, scanPos)) > 0)
	{
		scanPos += bytesRead;
		for (let i = 0; i < bytesRead; i++)
		{
			if (buffer[i] == 0xD || buffer[i] == 0xA)
			{
				if (currentWord.length > 0)
				{
					dictionaryWords.add(String.fromCharCode(...currentWord));
					currentWord = [];
				}
				continue;
			}
			currentWord.push(buffer[i]);
		}
	}
	fs.closeSync(dictionaryFD);

	return dictionaryWords;
}

async function buildIndex(config)
{
	let dictionaryWords = loadDictionary(config);

	wordVectorFile = await fs.promises.open(config.wordVectorFilename, 'r');
	wordIndex = new Map();
	vectorSize = -1;
	let numVectors = -1;
	
	let buffer = Buffer.alloc(config.maxHeaderSize);
	let bytesRead = fs.readSync(wordVectorFile.fd, buffer, 0, buffer.length, 0);
	if (bytesRead == 0)
	{
		throw new Error('No data in word vector file');
	}
	
	let scanPos = 0;
	for (let stringBuffer = new Array(); scanPos < bytesRead; scanPos++)
	{
		if (buffer[scanPos] == 0x20)
		{
			numVectors = parseInt(String.fromCharCode(...stringBuffer));
			scanPos++;
			break;
		}
		stringBuffer.push(buffer[scanPos]);
	}
	if (numVectors == -1)
	{
		throw new Error('Unable to determine number of entries in word vector file');
	}

	for (let stringBuffer = new Array(); scanPos < bytesRead; scanPos++)
	{
		if (buffer[scanPos] == 0x0A)
		{
			vectorSize = parseInt(String.fromCharCode(...stringBuffer));
			scanPos++;
			break;
		}
		stringBuffer.push(buffer[scanPos]);
	}
	if (vectorSize == -1)
	{
		throw new Error('Unable to determine dimensionality of word vectors');
	}

	buffer = Buffer.alloc(config.maxWordLength);
	let currentWord = [];
	let currentIndex = scanPos;
	while ((bytesRead = fs.readSync(wordVectorFile.fd, buffer, 0, buffer.length, scanPos)) > 0)
	{
		scanPos += bytesRead;
		for (let i = 0; i < bytesRead; i++)
		{
			if (buffer[i] == 0x20)
			{
				numVectors--;
				if (currentWord.length > 0)
				{
					let word = String.fromCharCode(...currentWord);
					currentIndex += word.length + 1;
					if (word.length <= config.maxWordLength && dictionaryWords.has(word))
					{
						wordIndex.set(word, currentIndex);
					}
					scanPos = currentIndex += vectorSize * 4;
					currentWord = [];
					break;
				}
				throw new Error(`Empty word at position ${currentIndex}`);
			}
			currentWord.push(buffer[i]);
		}
	}
	if (currentWord.length > 0)
	{
		throw new Error(`EOF while parsing word at position ${currentIndex}`);
	}
	if (numVectors != 0)
	{
		throw new Error('Number of entries in word vector file does not match header');
	}
}

async function getVector(word)
{
	if (!wordIndex.has(word))
	{
		return null;
	}

	let offset = wordIndex.get(word);
	let vector = new Float32Array(vectorSize);

	return wordVectorFile.read({buffer: vector, position: offset}).then((res) =>
	{
		if (res.bytesRead != vectorSize * 4)
		{
			throw new Error(`Partial read when attempting to load word vector for "${word}"`);
		}

		return vector;
	});
}

async function getSimilarity(word1, word2)
{
	if (!wordIndex)
	{
		throw new Error('Word index is not initialized');
	}

	let vector1 = await getVector(word1);
	let vector2 = await getVector(word2);

	if (vector1 == null || vector2 == null)
	{
		return null;
	}
	
	let dotProduct = 0;
	let len1 = 0;
	let len2 = 0;
	for (let i = 0; i < vectorSize; i++)
	{
		dotProduct += vector1[i] * vector2[i];
		len1 += vector1[i] * vector1[i];
		len2 += vector2[i] * vector2[i];
	}
	len1 = Math.sqrt(len1);
	len2 = Math.sqrt(len2);
	let cosineSimilarity = dotProduct / (len1 * len2);

	return cosineSimilarity;
}

function getSimilarityPath(word)
{
	return cacheDirectory + word;
}

async function haveSimilarityCached(word)
{
	return await fs.promises.access(getSimilarityPath(word)).then(() => true).catch(() => false);
}

async function getTopSimilarity(word, count = 2000)	//TODO: Optimize top-n calc: no need to keep tens of thousands of words in memory
{
	if (await haveSimilarityCached(word))	//TODO: verify count
	{
		return JSON.parse(await fs.promises.readFile(getSimilarityPath(word)));
	}

	let startTime = new Date();

	if (!wordIndex)
	{
		throw new Error('Word index is not initialized');
	}

	let vector1 = await getVector(word);
	if (vector1 == null)
	{
		return null;
	}
	let len1 = 0;
	for (let i = 0; i < vectorSize; i++)
	{
		len1 += vector1[i] * vector1[i];
	}
	len1 = Math.sqrt(len1);

	let similarityList = [];
	for (const word2 of wordIndex.keys())
	{
		if (word2 == word)
		{
			continue;
		}

		let vector2 = await getVector(word2);
		let dotProduct = 0;
		let len2 = 0;
		for (let i = 0; i < vectorSize; i++)
		{
			dotProduct += vector1[i] * vector2[i];
			len2 += vector2[i] * vector2[i];
		}
		len2 = Math.sqrt(len2);
		let cosineSimilarity = dotProduct / (len1 * len2);
		
		similarityList.push({word: word2, similarity: cosineSimilarity});
	}
	
	similarityList = similarityList.sort((a, b) => b.similarity - a.similarity).slice(0, count);
	await fs.promises.writeFile(getSimilarityPath(word), JSON.stringify(similarityList));
	console.log(`Top similarity calculation for ${word} took ${new Date() - startTime}ms`);

	return similarityList;
}

function getWordList()
{
	if (!wordIndex)
	{
		throw new Error('Word index is not initialized');
	}

	return [...wordIndex.keys()];
}

export default
{
	buildIndex,
	getSimilarity,
	getTopSimilarity,
	getWordList
};