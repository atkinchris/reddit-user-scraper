const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')
const util = require('util')
const streamPipeline = util.promisify(require('stream').pipeline)

const users = require('./users.json')

const headers = {
  'User-Agent': 'node:scraper:0.1.0 (by /u/atkinchris)',
}

const transformImageUrl = (url) => {
  const { ext } = path.parse(url)

  if (ext === '.jpg' || ext === '.png') {
    return { imageUrl: url, extension: ext }
  }

  if (url.includes('imgur.com/a')) {
    return {
      imageUrl: `${url}/zip`,
      extension: '.zip',
    }
  }

  throw Error(`Non-image URL ${url}`)
}

const formatDate = (date) =>
  date
    .toISOString()
    .replace(/\.\d{3}Z/, '')
    .replace(/T/, '_')
    .replace(/[\W]+/g, '-')

const fetchWithHeaders = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  if (!response.ok) throw Error(response.statusText)
  return response
}

const fetchUserPosts = async (username) => {
  const response = await fetchWithHeaders(`https://reddit.com/u/${username}/submitted.json`)
  const json = await response.json()
  return json.data.children.map((post) => post.data)
}

const postsToImages = (posts) =>
  posts.map(({ url, created_utc, author, subreddit }) => ({
    created: new Date(created_utc * 1000),
    url,
    author,
    subreddit,
  }))

const saveImages = (images, outputDir) =>
  Promise.all(
    images.map(async ({ url, created, author, subreddit }) => {
      try {
        const { imageUrl, extension } = transformImageUrl(url)
        const response = await fetchWithHeaders(imageUrl)
        const filename = path.join(outputDir, `${subreddit}_${formatDate(created)}${extension}`)

        if (fs.existsSync(filename)) {
          return
        }

        await streamPipeline(response.body, fs.createWriteStream(filename))
      } catch (err) {
        console.log(author, subreddit, created, err.message)
      }
    })
  )

const fetchUsersImages = async (username, outputDir) => {
  const posts = await fetchUserPosts(username)
  const images = postsToImages(posts)

  if (!images.length) return

  const userOutputDir = path.join(outputDir, username)

  if (!fs.existsSync(userOutputDir)) {
    fs.mkdirSync(userOutputDir)
  }

  await saveImages(images, userOutputDir)
}

const run = async (usernames) => {
  const outputDir = path.join(__dirname, 'images')

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
  }

  for (const username of usernames) {
    try {
      await fetchUsersImages(username, outputDir)
    } catch (err) {
      console.log(`Error fetching "${username}":`, err.message)
    }
  }
}

run(users).catch(console.error)
