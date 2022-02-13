import crypto from 'crypto';
import fs from 'fs';

import User from './user.mjs';

const userDirectory = 'data/users/';
var users = new Map();

function registerUser(user)
{
    users.set(user.id, user);
    user.eventEmitter.on('stateChange', (user) =>
    {
        persistUser(user);
    });
}

async function createUser(gameID, wordID)
{
    let user = new User(await generateUUID(), gameID, wordID);
    registerUser(user);
    
    await persistUser(user);

    return user;
}

async function loadUser(id)
{
    let user = User.fromJSON(await fs.promises.readFile(getPath(id)));
    registerUser(user);

    return user;
}

async function persistUser(user)
{
    await fs.promises.writeFile(getPath(user.id), user.toJSON());
}

function getPath(id)
{
    return `${userDirectory}${id}`;
}

async function generateUUID()
{
    let uuid = -1;
    while (uuid == -1)
    {
        uuid = crypto.randomUUID();
        if (await userExists(uuid)) //hey man you never know
        {
            uuid = -1;
        }
    }
    return uuid;
}

async function userExists(id)
{
    return id && (users.has(id) || fs.promises.access(getPath(id)).then(() => true).catch(() => false));
}

async function getUser(id)
{
    let user;
    if (await userExists(id))
    {
        user = users.get(id) || await loadUser(id);
    }
    return user;
}

async function getAllUsers()
{
    let allIDs = (await fs.promises.readdir(userDirectory)).filter(filename => !filename.startsWith('.'));
    let allUsers = [];
    for (let id of allIDs)
    {
        allUsers.push(await getUser(id));
    }
    return allUsers;
}

export default
{
    getUser,
    getAllUsers,
    createUser
}