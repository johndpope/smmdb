import { ObjectID } from 'mongodb'
import { decompress, deserialize, loadCourse } from 'cemu-smm'
import { zip } from 'cross-unzip'
import tmp from 'tmp'
import fileType from 'file-type'
import randomString from 'crypto-random-string'
import imageminWebp from 'imagemin-webp'

import { resolve, join } from 'path'
import fs from 'fs'

import Account from './Account'
import Database from './Database'

export default class Course {
  static async getCourse (courseId, accountId) {
    const res = await Database.filterCourses({ _id: ObjectID(courseId) }).toArray()
    if (!res || res.length !== 1) return null
    return Course.prepare(res[0], accountId)
  }

  static async prepare (course, accountId, filter) {
    if (accountId) course.starred = await Database.isCourseStarred(course._id, accountId)
    course.uploader = (await Account.getAccountByAccountId(course.owner)).username
    course.toJSON = Course.toJSON.bind(course, filter)
    return course
  }

  static toJSON (filter) {
    let result = Object.assign({}, this)
    result.id = this._id
    if (result.stars == null) result.stars = 0
    delete result._id
    if (filter) {
      for (let i in result) {
        if (!filter.includes(i)) {
          delete result[i]
        }
      }
    }
    return result
  }

  static async getCompressed (title, data) {
    const tmpDir = tmp.dirSync({
      unsafeCleanup: true
    })
    const zipDir = join(tmpDir.name, 'course000')
    fs.mkdirSync(zipDir)
    const course = await deserialize(data)
    await course.writeToSave(0, zipDir)
    const outPath = join(tmpDir.name, `${title.replace(/[^a-z|A-Z|0-9| |\-|!]/g, '')}.zip`)
    try {
      const res = await new Promise((resolve, reject) => {
        zip(zipDir, outPath, err => {
          if (err) reject(err)
          resolve(outPath)
        })
      })
      setTimeout(() => {
        tmpDir.removeCallback()
      }, 20000)
      return res
    } catch (err) {
      console.log(err)
      tmpDir.removeCallback()
      return null
    }
  }

  static getObject (courseData) {
    return deserialize(courseData)
  }

  static async get3DS (courseData) {
    return (await deserialize(courseData)).to3DS()
  }

  static async fromBuffer (buffer, account) {
    const tmpFile = resolve(__dirname, randomString(10))
    fs.writeFileSync(tmpFile, buffer)
    const type = fileType(buffer)
    const mime = type && type.mime
    const buf = new Uint8Array(buffer)
    const is3DS = () => {
      const header = [0x04, 0x30, 0x04, 0x00, 0x7D, 0x00, 0x00, 0x00, 0xDD, 0xBA, 0xFE, 0xCA]
      for (let i = 0; i < header.length; i++) {
        if (header[i] !== buf[i + 4]) {
          return false
        }
      }
      return true
    }
    const createCourse = async (courseData) => {
      const course = Object.assign({}, courseData)
      const courseD = {}
      course.owner = account._id
      course.nintendoid = null
      course.videoid = null
      course.difficulty = 1
      course.lastmodified = course.modified
      delete course.modified
      course.uploaded = Math.floor(new Date().getTime() / 1000)
      if (!course.maker) {
        const username = account.username.substr(0, 10)
        course.maker = username
        await courseData.setMaker(username)
      }
      delete course.tiles
      delete course.tilesSub
      delete course.sounds
      delete course.soundsSub
      courseD.courseData = await courseData.serialize()
      courseD.courseDataGz = await courseData.serializeGzipped()
      courseD.thumbnail = course.thumbnail
      courseD.thumbnailWebp = await imageminWebp({
        quality: 80,
        method: 6
      })(course.thumbnail)
      courseD.thumbnailPreview = course.thumbnailPreview
      courseD.thumbnailPreviewWebp = await imageminWebp({
        quality: 80,
        method: 6
      })(course.thumbnailPreview)
      delete course.thumbnail
      delete course.thumbnailPreview
      courseD._id = ObjectID(await Database.addCourse(course))
      await Database.addCourseData(courseD)
      return Course.prepare(course)
    }
    try {
      if (mime === 'application/x-rar-compressed' || mime === 'application/zip' || mime === 'application/x-7z-compressed' || mime === 'application/x-tar') {
        try {
          const courseData = await decompress(tmpFile)
          if (courseData == null || courseData.length === 0) {
            return {
              code: 400,
              err: `A compressed file was uploaded, but no course was found. Compressed files are assumed to contain Wii U courses.\n\nPlease try adding your courses to sub folders called course000, course001 etc inside your compressed file.`
            }
          }
          const courses = []
          for (let i = 0; i < courseData.length; i++) {
            const course = await createCourse(courseData[i])
            courses.push(course)
          }
          return courses
        } catch (err) {
          return {
            code: 500,
            err: `An internal server error occurred:\n\n${err}\n\nPlease report this error to the webmaster.`
          }
        }
      } else if (is3DS()) {
        const courseData = await loadCourse(tmpFile, 0, false)
        await courseData.loadThumbnail()
        const course = await createCourse(courseData)
        return [course]
      } else {
        return {
          code: 400,
          err: `Wrong mime type: ${mime}\n\nSupported mime types are:\napplication/zip, application/x-7z-compressed, application/x-tar, application/x-rar-compressed for Wii U and\nheader of 0x04, 0x30, 0x04, 0x00, 0x7D, 0x00, 0x00, 0x00, 0xDD, 0xBA, 0xFE, 0xCA for 3DS`
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        err: `An internal server error occurred:\n\n${err}\n\nPlease report this error to the webmaster.`
      }
    } finally {
      fs.unlinkSync(tmpFile)
    }
  }

  static async reupload (course, buffer) {
    const tmpFile = resolve(__dirname, randomString(10))
    fs.writeFileSync(tmpFile, buffer)
    const type = fileType(buffer)
    const mime = type && type.mime
    const buf = new Uint8Array(buffer)
    const is3DS = () => {
      const header = [0x04, 0x30, 0x04, 0x00, 0x7D, 0x00, 0x00, 0x00, 0xDD, 0xBA, 0xFE, 0xCA]
      for (let i = 0; i < header.length; i++) {
        if (header[i] !== buf[i + 4]) {
          return false
        }
      }
      return true
    }
    const doUpdate = async (course, courseData) => {
      const update = {}
      const updateData = {}
      if (!(await courseData.isThumbnailBroken())) {
        updateData.thumbnail = courseData.thumbnail
        course.thumbnail = update.thumbnail
        updateData.thumbnailWebp = await imageminWebp({
          quality: 80,
          method: 6
        })(courseData.thumbnail)
        updateData.thumbnailPreview = courseData.thumbnailPreview
        course.thumbnailPreview = update.thumbnailPreview
        updateData.thumbnailPreviewWebp = await imageminWebp({
          quality: 80,
          method: 6
        })(courseData.thumbnailPreview)
        update.vFull = course.vFull ? course.vFull + 1 : 1
        update.vPrev = course.vPrev ? course.vPrev + 1 : 1
        course.vFull = update.vFull
        course.vPrev = update.vPrev
      }
      await courseData.setTitle(course.title)
      await courseData.setMaker(course.maker)
      course.gameStyle = courseData.gameStyle
      course.courseTheme = courseData.courseTheme
      course.courseThemeSub = courseData.courseThemeSub
      course.time = courseData.time
      course.autoScroll = courseData.autoScroll
      course.autoScrollSub = courseData.autoScrollSub
      course.width = courseData.width
      course.widthSub = courseData.widthSub
      course.lastmodified = courseData.modified
      course.courseData = await courseData.serialize()
      updateData.courseData = course.courseData
      course.courseDataGz = await courseData.serializeGzipped()
      updateData.courseDataGz = course.courseDataGz
      await Database.updateCourse(course._id, update)
      await Database.updateCourseData(course._id, updateData)
    }
    try {
      if (mime === 'application/x-rar-compressed' || mime === 'application/zip' || mime === 'application/x-7z-compressed' || mime === 'application/x-tar') {
        try {
          const courseData = await decompress(tmpFile)
          if (!courseData || courseData.length !== 1) {
            return {
              code: 400,
              err: `A compressed file was uploaded, but no course was found or too many courses were found. Compressed files are assumed to contain Wii U courses.\n\nPlease try adding your courses to sub folders called course000, course001 etc inside your compressed file.`
            }
          }
          await doUpdate(course, courseData[0])
          return course
        } catch (err) {
          return {
            code: 500,
            err: `An internal server error occurred:\n\n${err}\n\nPlease report this error to the webmaster.`
          }
        }
      } else if (is3DS()) {
        const courseData = await loadCourse(tmpFile, 0, false)
        await courseData.loadThumbnail()
        await doUpdate(course, courseData)
        return course
      } else {
        return {
          code: 400,
          err: `Wrong mime type: ${mime}\n\nSupported mime types are:\napplication/zip, application/x-7z-compressed, application/x-tar, application/x-rar-compressed for Wii U and\nheader of 0x04, 0x30, 0x04, 0x00, 0x7D, 0x00, 0x00, 0x00, 0xDD, 0xBA, 0xFE, 0xCA for 3DS`
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        err: `An internal server error occurred:\n\n${err}\n\nPlease report this error to the webmaster.`
      }
    } finally {
      fs.unlinkSync(tmpFile)
    }
  }

  static async update (courseDB, courseData, { title, maker, nintendoid, videoid, difficulty, description }) {
    const update = {}
    const updateData = {}
    const course = await deserialize(courseData)
    if (title) {
      update.title = title
      courseDB.title = title
      await course.setTitle(title)
    }
    if (maker) {
      update.maker = maker
      courseDB.maker = maker
      await course.setMaker(maker)
    }
    if (nintendoid != null) {
      update.nintendoid = nintendoid
      courseDB.nintendoid = nintendoid
    }
    if (videoid != null) {
      update.videoid = videoid
      courseDB.videoid = videoid
    }
    if (difficulty != null) {
      update.difficulty = difficulty
      courseDB.difficulty = difficulty
    }
    if (description != null) {
      update.description = description
      courseDB.description = description
    }
    update.lastmodified = Math.trunc((new Date()).getTime() / 1000)
    courseDB.lastmodified = update.lastmodified
    await course.setModified(update.lastmodified)
    updateData.courseData = await course.serialize()
    updateData.courseDataGz = await course.serializeGzipped()
    await Database.updateCourse(courseDB._id, update)
    await Database.updateCourseData(courseDB._id, updateData)
  }

  static async setThumbnail (courseDB, courseData, buffer, isWide, doClip) {
    try {
      const course = await deserialize(courseData)
      const thumbnail = await course.setThumbnail(buffer, isWide, doClip)
      let update = {}
      let updateData = {}
      if (isWide) {
        courseDB.vFull = courseDB.vFull ? courseDB.vFull + 1 : 1
        update.vFull = courseDB.vFull
        updateData.thumbnail = thumbnail
        updateData.thumbnailWebp = await imageminWebp({
          quality: 80,
          method: 6
        })(thumbnail)
      } else {
        courseDB.vPrev = courseDB.vPrev ? courseDB.vPrev + 1 : 1
        update.vPrev = courseDB.vPrev
        updateData.thumbnailPreview = thumbnail
        updateData.thumbnailPreviewWebp = await imageminWebp({
          quality: 80,
          method: 6
        })(thumbnail)
      }
      update.lastmodified = Math.trunc((new Date()).getTime() / 1000)
      courseDB.lastmodified = update.lastmodified
      await course.setModified(update.lastmodified)
      updateData.courseData = await course.serialize()
      updateData.courseDataGz = await course.serializeGzipped()
      await Database.updateCourse(courseDB._id, update)
      await Database.updateCourseData(courseDB._id, updateData)
      return thumbnail
    } catch (err) {
      return {
        code: 500,
        err: `An internal server error occurred:\n\n${err}\n\nPlease report this error to the webmaster.`
      }
    }
  }

  static async delete (courseId) {
    await Database.deleteCourse(courseId)
    await Database.deleteCourseData(courseId)
  }

  static async star (course, accountId) {
    if (await Database.isCourseStarred(course._id, accountId)) {
      await Database.unstarCourse(course._id, accountId)
      course.stars--
      course.starred = 0
    } else {
      await Database.starCourse(course._id, accountId)
      if (course.stars != null) {
        course.stars++
      } else {
        course.stars = 1
      }
      course.starred = 1
    }
  }

  static getCourseAmount () {
    return Database.getCoursesCount()
  }
}
