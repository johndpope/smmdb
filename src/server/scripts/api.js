import parseRange from 'range-parser'
import fileType from 'file-type'
import {
  ObjectID
} from 'mongodb'
import { encode } from 'ini'

import * as fs from 'fs'
import * as path from 'path'

import Database from '../Database'
import Account from '../Account'
import Course from '../Course'
import Course64 from '../Course64'
import { Bot } from '..'

const MAX_FILTER_LIMIT = 120

const NINTENDO_ID = /^[0-9A-Z|\\-]+$/
const VIDEO_ID = /^[a-z0-9A-Z| |.|\\_|\\-]+$/
const USERNAME = /^[a-z0-9A-Z|.|\\_|\\-]+$/
const MIN_LENGTH_USERNAME = 3
const MAX_LENGTH_USERNAME = 20

export default class API {
  static async getStats (res) {
    const result = {
      courses: await Course.getCourseAmount(),
      courses64: await Course64.getCourseAmount(),
      accounts: await Account.getAccountAmount()
    }
    res.json(result)
  }

  static async getCourses (app, req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    const account = await Account.getAccountByAPIKey(apiKey)
    if (apiData.prettify) {
      app.set('json spaces', 2)
    }
    const courses = await this.filterCourses(account ? account._id : null, apiData)
    if (apiData.format === 'ini') {
      res.set('Content-type', 'text/plain')
      res.send(`${encode({ General: { lvlcount: courses.length } })}\n${encode(JSON.parse(JSON.stringify(courses)), {
        section: 'Level'
      })}`)
    } else {
      res.json(courses)
    }
    if (apiData.prettify) {
      app.set('json spaces', 0)
    }
  }

  static async getCourses64 (app, req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    const account = await Account.getAccountByAPIKey(apiKey)
    if (apiData.prettify) {
      app.set('json spaces', 2)
    }
    res.json(await this.filterCourses64(account ? account._id : null, apiData))
    if (apiData.prettify) {
      app.set('json spaces', 0)
    }
  }

  static async filterCourses (accountId, filterData = {}) {
    let orderBy = 'lastmodified'
    let dir = -1

    if (filterData.order) {
      orderBy = filterData.order
    }
    if (filterData.dir) {
      dir = filterData.dir === 'asc' ? 1 : -1
    }

    const limit = filterData.limit ? Math.min(+filterData.limit > 0 ? filterData.limit : MAX_FILTER_LIMIT, MAX_FILTER_LIMIT) : MAX_FILTER_LIMIT
    const start = filterData.start ? +filterData.start : 0

    const filter = {}
    if (filterData.ids) {
      if (!filter._id) filter._id = { $in: [] }
      try {
        const ids = filterData.ids.split(',')
        for (let i in ids) {
          filter._id.$in.push(ObjectID(ids[i]))
        }
      } catch (err) {}
    }
    if (filterData.lastmodifiedfrom) {
      if (!filter.lastmodified) filter.lastmodified = {}
      filter.lastmodified.$gte = parseInt(filterData.lastmodifiedfrom)
    }
    if (filterData.lastmodifiedto) {
      if (!filter.lastmodified) filter.lastmodified = {}
      filter.lastmodified.$lte = parseInt(filterData.lastmodifiedto)
    }
    if (filterData.uploadedfrom) {
      if (!filter.uploaded) filter.uploaded = {}
      filter.uploaded.$gte = parseInt(filterData.uploadedfrom)
    }
    if (filterData.uploadedto) {
      if (!filter.uploaded) filter.uploaded = {}
      filter.uploaded.$lte = parseInt(filterData.uploadedto)
    }
    if (filterData.difficultyfrom) {
      if (!filter.difficulty) filter.difficulty = {}
      filter.difficulty.$gte = parseInt(filterData.difficultyfrom)
    }
    if (filterData.difficultyto) {
      if (!filter.difficulty) filter.difficulty = {}
      filter.difficulty.$lte = parseInt(filterData.difficultyto)
    }
    if (filterData.title) {
      filter.title = new RegExp(`.*${filterData.title}.*`, 'i')
    }
    if (filterData.maker) {
      filter.maker = new RegExp(`${filterData.maker}`, 'i')
    }
    if (filterData.uploader) {
      const acc = await Database.filterAccounts({ username: new RegExp(`^${filterData.uploader}$`, 'i') }).toArray()
      if (acc.length !== 1 || !acc[0]._id) return []
      filter.owner = ObjectID(acc[0]._id)
    }
    if (filterData.owner) {
      filter.owner = ObjectID(filterData.owner)
    }
    if (filterData.gamestyle) {
      filter.gameStyle = parseInt(filterData.gamestyle)
    }
    if (filterData.coursetheme) {
      filter.courseTheme = parseInt(filterData.coursetheme)
    }
    if (filterData.coursethemesub) {
      filter.courseThemeSub = parseInt(filterData.coursethemesub)
    }
    if (filterData.timefrom) {
      if (!filter.time) filter.time = {}
      filter.time.$gte = parseInt(filterData.timefrom)
    }
    if (filterData.timeto) {
      if (!filter.time) filter.time = {}
      filter.time.$lte = parseInt(filterData.timeto)
    }
    if (filterData.autoscroll) {
      filter.autoScroll = parseInt(filterData.autoscroll)
    }
    if (filterData.autoscrollsub) {
      filter.autoScrollSub = parseInt(filterData.autoscrollsub)
    }
    if (filterData.widthfrom) {
      if (!filter.width) filter.width = {}
      filter.width.$gte = parseInt(filterData.widthfrom)
    }
    if (filterData.widthto) {
      if (!filter.width) filter.width = {}
      filter.width.$lte = parseInt(filterData.widthto)
    }
    if (filterData.widthsubfrom) {
      if (!filter.widthSub) filter.widthSub = {}
      filter.widthSub.$gte = parseInt(filterData.widthsubfrom)
    }
    if (filterData.widthsubto) {
      if (!filter.widthSub) filter.widthSub = {}
      filter.widthSub.$lte = parseInt(filterData.widthsubto)
    }
    const res = await Database.filterCourses(filter, { [orderBy]: dir }, start, limit, filterData.random === '1').toArray()
    for (let i in res) {
      await Course.prepare(res[i], accountId, filterData.filter && filterData.filter.split(','))
    }
    return res
  }

  static async filterCourses64 (accountId, filterData = {}) {
    let orderBy = 'lastmodified'
    let dir = -1

    if (filterData.order) {
      orderBy = filterData.order
    }
    if (filterData.dir) {
      dir = filterData.dir === 'asc' ? 1 : -1
    }

    const limit = filterData.limit ? Math.min(+filterData.limit > 0 ? filterData.limit : MAX_FILTER_LIMIT, MAX_FILTER_LIMIT) : MAX_FILTER_LIMIT
    const start = filterData.start ? +filterData.start : 0

    const filter = {}
    if (filterData.ids) {
      if (!filter._id) filter._id = { $in: [] }
      try {
        const ids = filterData.ids.split(',')
        for (let i in ids) {
          filter._id.$in.push(ObjectID(ids[i]))
        }
      } catch (err) {}
    }
    if (filterData.lastmodifiedfrom) {
      if (!filter.lastmodified) filter.lastmodified = {}
      filter.lastmodified.$gte = parseInt(filterData.lastmodifiedfrom)
    }
    if (filterData.lastmodifiedto) {
      if (!filter.lastmodified) filter.lastmodified = {}
      filter.lastmodified.$lte = parseInt(filterData.lastmodifiedto)
    }
    if (filterData.uploadedfrom) {
      if (!filter.uploaded) filter.uploaded = {}
      filter.uploaded.$gte = parseInt(filterData.uploadedfrom)
    }
    if (filterData.uploadedto) {
      if (!filter.uploaded) filter.uploaded = {}
      filter.uploaded.$lte = parseInt(filterData.uploadedto)
    }
    if (filterData.difficultyfrom) {
      if (!filter.difficulty) filter.difficulty = {}
      filter.difficulty.$gte = parseInt(filterData.difficultyfrom)
    }
    if (filterData.difficultyto) {
      if (!filter.difficulty) filter.difficulty = {}
      filter.difficulty.$lte = parseInt(filterData.difficultyto)
    }
    if (filterData.title) {
      filter.title = new RegExp(`.*${filterData.title}.*`, 'i')
    }
    if (filterData.uploader) {
      const acc = await Database.filterAccounts({ username: new RegExp(`^${filterData.uploader}$`, 'i') }).toArray()
      if (acc.length !== 1 || !acc[0]._id) return []
      filter.owner = ObjectID(acc[0]._id)
    }
    if (filterData.owner) {
      filter.owner = ObjectID(filterData.owner)
    }
    if (filterData.coursetheme) {
      filter.courseTheme = parseInt(filterData.coursetheme)
    }
    const res = await Database.filterCourses64(filter, { [orderBy]: dir }, start, limit, filterData.random === '1').toArray()
    for (let i in res) {
      await Course64.prepare(res[i], accountId, filterData.filter && filterData.filter.split(','))
    }
    return res
  }

  static async downloadCourse (req, res, apiData, downloadMetrics) {
    const course = await Course.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    const [courseData, courseDataGz] = await Database.getCourseData(course._id)
    if (!courseData) {
      res.status(500).send(`Course data was not found`)
      return
    }
    if (apiData.type === 'zip') {
      const file = await Course.getCompressed(course.title, courseData)
      if (typeof (file) === 'string') {
        res.setHeader('Content-Type', 'application/zip')
        try {
          res.download(file)
          downloadMetrics.downloadsPerDay.mark()
          downloadMetrics.downloadsWiiUPerDay.mark()
        } catch (err) {
          console.error(err)
          console.error(`Unable to send file: ${file}`)
        }
      } else {
        res.status(500).send('Could not compress file')
      }
    } else if (apiData.type === 'json') {
      res.json(await Course.getObject(courseData))
    } else if (apiData.type === '3ds') {
      res.setHeader('Content-Type', 'application/3ds')
      const course3ds = await Course.get3DS(courseData)
      if (req.headers.range) {
        const range = parseRange(course3ds.length, req.headers.range, { combine: true })
        if (range === -1) {
          res.status(400).send('Unsatisfiable range')
          return
        }
        if (range === -2) {
          res.status(400).send('Malformed header string')
          return
        }
        let resBuffer = Buffer.alloc(0)
        if (range.type === 'bytes') {
          range.forEach(r => {
            resBuffer = Buffer.concat([resBuffer, course3ds.slice(r.start, r.end)])
          })
          res.send(resBuffer)
          downloadMetrics.downloadsPerDay.mark()
          downloadMetrics.downloads3DSPerDay.mark()
        } else {
          res.status(400).send('Unknown range type')
        }
      } else {
        res.set('Content-disposition', `attachment;filename=${encodeURI(course.title)}.3ds`)
        res.send(course3ds)
        downloadMetrics.downloadsPerDay.mark()
        downloadMetrics.downloads3DSPerDay.mark()
      }
    } else {
      res.set('Content-Encoding', 'gzip')
      res.set('Content-Type', 'application/wiiu')
      res.send(courseDataGz)
      downloadMetrics.downloadsPerDay.mark()
      downloadMetrics.downloadsProtoPerDay.mark()
    }
  }

  static async downloadCourse64 (req, res, apiData, downloadMetrics) {
    const course = await Course64.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    res.set('Content-Type', 'application/sm64m')
    res.set('Content-disposition', `attachment;filename=${encodeURI(course.title)}.zip`)
    res.set('Content-Length', course.data.buffer.length)
    res.send(course.data.buffer)
    downloadMetrics.downloadsPerDay.mark()
    downloadMetrics.downloads64PerDay.mark()
  }

  static async uploadCourse (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const courses = await Course.fromBuffer(req.body, account)
    if (!courses || courses.length === 0) {
      res.status(500).send('Could not read course')
    } else if (courses.code) {
      res.status(courses.code).send(courses.err)
    } else {
      const uploadPath = path.join(__dirname, '../../uploads')
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath)
      }
      fs.writeFileSync(path.join(uploadPath, String(courses[0]._id)), req.body)
      try {
        Bot.uploadCourse(courses, account)
      } catch (err) {
        console.log(err)
      }
      if (apiData.format === 'ini') {
        res.set('Content-type', 'text/plain')
        res.send(`${encode({ General: { lvlcount: courses.length } })}\n${encode(JSON.parse(JSON.stringify(courses)), {
          section: 'Level'
        })}`)
      } else {
        res.json(courses)
      }
    }
  }

  static async uploadCourse64 (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const type = fileType(req.body)
    const mime = type && type.mime
    if (mime !== 'application/zip') {
      res.status(400).send(`Wrong mime type: ${mime}`)
      return
    }
    const course = await Course64.fromBuffer(req.headers.filename, req.body, account)
    if (!course) {
      res.status(500).send('Could not read course')
    } else {
      try {
        Bot.uploadCourse64(course, account)
      } catch (err) {
        console.log(err)
      }
      res.json(course)
    }
  }

  static async reuploadCourse (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const courseId = req.get('course-id')
    if (courseId == null) {
      res.status(400).send('No course ID found. Please set a "course-id" HTTP header')
      return
    }
    const course = await Course.getCourse(courseId, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${courseId} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${courseId} is not owned by account with API key ${apiKey}`)
      return
    }
    const result = await Course.reupload(course, req.body)
    if (result == null) {
      res.status(500).send('Could not read course')
      return
    } else if (result.code) {
      res.status(result.code).send(result.err)
      return
    }
    const uploadPath = path.join(__dirname, '../../uploads')
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath)
    }
    fs.writeFileSync(path.join(uploadPath, String(course._id)), req.body)
    try {
      Bot.updateCourse(course, account)
    } catch (err) {
      console.log(err)
    }
    if (apiData.format === 'ini') {
      res.set('Content-type', 'text/plain')
      res.send(encode(JSON.parse(JSON.stringify(course))))
    } else {
      res.json(course)
    }
  }

  static async reuploadCourse64 (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const courseId = req.get('course-id')
    if (courseId == null) {
      res.status(400).send('No course ID found. Please set a "course-id" HTTP header')
      return
    }
    const type = fileType(req.body)
    const mime = type && type.mime
    if (mime !== 'application/zip') {
      res.status(400).send(`Wrong mime type: ${mime}\n\napplication/zip is the only accepted mime type`)
      return
    }
    const course = await Course64.getCourse(courseId, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${courseId} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${courseId} is not owned by account with API key ${apiKey}`)
      return
    }
    const result = await Course64.reupload(course, req.body, account._id)
    if (result == null) {
      res.status(500).send('Could not read course')
      return
    } else if (result.code) {
      res.status(result.code).send(result.err)
      return
    }
    res.json(course)
  }

  static async updateCourse (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    if (!apiData.id) {
      res.status(400).send('No course ID submitted')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course.getCourse(apiData.id, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${apiData.id} is not owned by account with API key ${apiData.apikey}`)
      return
    }
    const [courseData] = await Database.getCourseData(course._id)
    const update = {}
    if (req.body.title) update.title = req.body.title
    if (req.body.maker) update.maker = req.body.maker
    if (req.body.nintendoid != null) {
      const nId = req.body.nintendoid
      if (nId === '') {
        update.nintendoid = ''
      } else {
        const a = nId.split('-')
        if (NINTENDO_ID.test(nId) && a.length === 4 && a[0].length === 4 && a[1].length === 4 && a[2].length === 4 && a[3].length === 4) {
          update.nintendoid = nId
        }
      }
    }
    if (req.body.videoid != null && (VIDEO_ID.test(req.body.videoid) || req.body.videoid === '')) {
      update.videoid = req.body.videoid
    }
    if (req.body.difficulty != null) {
      try {
        const difficulty = JSON.parse(req.body.difficulty)
        if (difficulty >= 0 && difficulty <= 3) {
          update.difficulty = difficulty
        }
      } catch (err) {}
    }
    await Course.update(course, courseData, update)
    if (apiData.format === 'ini') {
      res.set('Content-type', 'text/plain')
      res.send(encode(JSON.parse(JSON.stringify(course))))
    } else {
      res.json(course)
    }
  }

  static async updateCourse64 (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    if (!apiData.id) {
      res.status(400).send('No course ID submitted')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course64.getCourse(apiData.id, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${apiData.id} is not owned by account with API key ${apiData.apikey}`)
      return
    }
    const courseData = {}
    if (req.body.title) courseData.title = req.body.title
    if (req.body.videoid != null && (VIDEO_ID.test(req.body.videoid) || req.body.videoid === '')) {
      courseData.videoid = req.body.videoid
    }
    if (req.body.difficulty != null) {
      try {
        const difficulty = JSON.parse(req.body.difficulty)
        if (difficulty >= 0 && difficulty <= 3) {
          courseData.difficulty = difficulty
        }
      } catch (err) {}
    }
    if (req.body.stars != null) {
      try {
        const stars = parseInt(req.body.stars)
        if (stars >= 0 && stars <= 99) {
          courseData.stars = stars
        }
      } catch (err) {}
    }
    if (req.body.theme != null) {
      try {
        const theme = JSON.parse(req.body.theme)
        if (theme >= 0 && theme <= 11) {
          courseData.theme = theme
        }
      } catch (err) {}
    }
    await Course64.update(course, courseData)
    res.json(course)
  }

  static async deleteCourse (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${apiData.id} is not owned by account with API key ${apiKey}`)
      return
    }
    await Course.delete(course._id)
    res.send('OK')
  }

  static async deleteCourse64 (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course64.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${apiData.id} is not owned by account with API key ${apiKey}`)
      return
    }
    await Course64.delete(course._id)
    res.send('OK')
  }

  static async starCourse (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    try {
      await Course.star(course, account._id)
    } catch (err) {
      console.error(err)
    }
    res.json(course)
  }

  static async starCourse64 (req, res, apiData) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const course = await Course64.getCourse(apiData.id)
    if (!course) {
      res.status(400).send(`Course with ID ${apiData.id} not found`)
      return
    }
    try {
      await Course64.star(course, account._id)
    } catch (err) {
      console.error(err)
    }
    res.json(course)
  }

  static async uploadImage (req, res, isWide) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const courseId = req.get('course-id')
    if (courseId == null) {
      res.status(400).send('No course ID found. Please set a "course-id" HTTP header')
      return
    }
    const course = await Course.getCourse(courseId, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${courseId} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${courseId} is not owned by account with API key ${apiKey}`)
      return
    }
    if (!course) {
      res.status(400).send(`Course with ID ${courseId} not found`)
      return
    }
    const type = fileType(req.body)
    const mime = type && type.mime
    if (mime && /^image\/.+$/.test(mime)) {
      const [courseData] = await Database.getCourseData(course._id)
      const thumbnail = await Course.setThumbnail(course, courseData, req.body, isWide, !isWide)
      if (thumbnail) {
        res.json(course)
      } else if (thumbnail.code) {
        res.status(thumbnail.code).send(thumbnail.err)
      } else {
        res.status(500).send('Could not change course thumbnail')
      }
    } else {
      res.status(400).send(`Wrong mime type: ${mime}`)
    }
  }

  static async uploadImage64 (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const courseId = req.get('course-id')
    if (courseId == null) {
      res.status(400).send('No course ID found. Please set a "course-id" HTTP header')
      return
    }
    const course = await Course64.getCourse(courseId, account._id)
    if (!course) {
      res.status(400).send(`Course with ID ${courseId} not found`)
      return
    }
    if (!course.owner.equals(account._id) && account.permissions !== 1) {
      res.status(403).send(`Course with ID ${courseId} is not owned by account with API key ${apiKey}`)
      return
    }
    const type = fileType(req.body)
    const mime = type && type.mime
    if (mime && /^image\/.+$/.test(mime)) {
      const thumbnail = await Course64.setThumbnail(course, req.body)
      if (thumbnail) {
        res.json(course)
      } else if (thumbnail.code) {
        res.status(thumbnail.code).send(thumbnail.err)
      } else {
        res.status(500).send('Could not change course thumbnail')
      }
    } else {
      res.status(400).send(`Wrong mime type: ${mime}`)
    }
  }

  static async uploadImageBlog (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const blogId = req.get('course-id')
    if (blogId == null) {
      res.status(400).send('No blog ID found. Please set a "course-id" HTTP header')
      return
    }
    const blogPost = await Database.getBlogPost(account._id, blogId)
    if (!blogPost) {
      res.status(400).send(`Blog with ID ${blogId} not found`)
      return
    }
    const type = fileType(req.body)
    const mime = type && type.mime
    if (mime && /^image\/.+$/.test(mime)) {
      const imageId = await Database.addBlogPostImage(blogPost._id, req.body)
      if (imageId) {
        res.send(imageId)
      } else {
        res.status(500).send('Could not change course thumbnail')
      }
    } else {
      res.status(400).send(`Wrong mime type: ${mime}`)
    }
  }

  static async getAccountData (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey, false)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    res.json(account)
  }

  static async setAccountData (req, res) {
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey, false)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    const update = {}
    if (req.body.username && req.body.username.length >= MIN_LENGTH_USERNAME && req.body.username.length <= MAX_LENGTH_USERNAME && USERNAME.test(req.body.username)) {
      update.username = req.body.username
    }
    if (req.body.downloadformat) {
      update.downloadFormat = typeof (req.body.downloadformat) !== 'number' ? parseInt(req.body.downloadformat) : req.body.downloadformat
    }
    await Account.update(account, update)
    res.json(account)
  }

  static async blogPost (req, res) {
    if (!req.body) {
      res.status(400).send(`Empty request`)
      return
    }
    const auth = req.get('Authorization')
    const apiKey = auth != null && auth.includes('APIKEY ') && auth.split('APIKEY ')[1]
    if (!apiKey) {
      res.status(401).send('API key required')
      return
    }
    const account = await Account.getAccountByAPIKey(apiKey, false)
    if (account == null) {
      res.status(400).send(`Account with API key ${apiKey} not found`)
      return
    }
    if (req.body.method === 'get') {
      res.json(await Database.getBlogPost(account._id))
    } else if (req.body.method === 'update' && req.body.md !== '') {
      res.json({ _id: await Database.setBlogPost(account._id, req.body._id, req.body.md) })
    }
  }

  static async getAmazonProducts (req, res, apiData) {
    const country = apiData.country
    if (!country) {
      res.status(400).send('country required')
      return
    }
    const products = await Database.getAmazonProducts(country)
    products.forEach(x => {
      delete x._id
    })
    res.json(products)
  }
}
