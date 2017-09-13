import {
  MongoClient, ObjectID
} from 'mongodb'
import jimp from 'jimp'

import fs from 'fs'
import path from 'path'

import { log } from './scripts/util'

const mongoUrl = 'mongodb://localhost:27017'

export default class Database {
  static async initialize (isTest = false) {
    log('Connecting to database')
    this.db = await MongoClient.connect(mongoUrl)
    log('Connected')

    if (isTest) {
      try {
        await this.db.collection('coursesTest').drop()
      } catch (err) {}
      try {
        await this.db.collection('accountsTest').drop()
      } catch (err) {}
      this.courses = this.db.collection('coursesTest')
      this.courses64 = this.db.collection('courses64Test')
      this.accounts = this.db.collection('accountsTest')
      this.stars = this.db.collection('starsTest')
      this.stars64 = this.db.collection('stars64Test')
      this.amazon = this.db.collection('amazonTest')
    } else {
      this.courses = this.db.collection('courses')
      this.courseData = this.db.collection('courseData')
      this.courses64 = this.db.collection('courses64')
      this.accounts = this.db.collection('accounts')
      this.stars = this.db.collection('stars')
      this.stars64 = this.db.collection('stars64')
      this.blog = this.db.collection('blog')
      this.blogImages = this.db.collection('blogImages')
      this.amazon = this.db.collection('amazon')
    }
    // await this.courses.createIndex({ lastModified: 1, stars: 1, title: 1 })
    /* const courseDataPath = path.join(__dirname, '../static/coursedata')
    const courseDataFiles = fs.readdirSync(courseDataPath)
    const courseImgPath = path.join(__dirname, '../static/courseimg')
    const courseImgFiles = fs.readdirSync(courseImgPath)
    const entries = await this.courses.find().toArray()
    for (let entry of entries) {
      const courseId = String(entry._id)
      try {
        if (!courseDataFiles.includes(courseId) || !courseDataFiles.includes(courseId + '.gz')) continue
        const update = {
          _id: ObjectID(courseId),
          courseData: fs.readFileSync(path.join(courseDataPath, courseId)),
          courseDataGz: fs.readFileSync(path.join(courseDataPath, courseId + '.gz'))
        }
        if (courseImgFiles.includes(`${courseId}.jpg`)) update.thumbnailPreview = fs.readFileSync(path.join(courseImgPath, `${courseId}.jpg`))
        if (courseImgFiles.includes(`${courseId}_full.jpg`)) update.thumbnail = fs.readFileSync(path.join(courseImgPath, `${courseId}_full.jpg`))
        // await this.courseData.insertOne(update)
        if (fs.existsSync(path.join(courseDataPath, courseId))) fs.unlinkSync(path.join(courseDataPath, courseId))
        if (fs.existsSync(path.join(courseDataPath, `${courseId}.gz`))) fs.unlinkSync(path.join(courseDataPath, `${courseId}.gz`))
        if (fs.existsSync(path.join(courseImgPath, `${courseId}.jpg`))) fs.unlinkSync(path.join(courseImgPath, `${courseId}.jpg`))
        if (fs.existsSync(path.join(courseImgPath, `${courseId}_full.jpg`))) fs.unlinkSync(path.join(courseImgPath, `${courseId}_full.jpg`))
      } catch (err) {
        console.error(err)
      }
    } */
  }

  static async addCourse (course) {
    return (await this.courses.insertOne(course)).insertedId
  }

  static addCourseData (course) {
    return this.courseData.insertOne(course)
  }

  static addCourse64 (course) {
    return this.courses64.insertOne(course)
  }

  static updateCourse (id, course) {
    return this.courses.updateOne({ '_id': ObjectID(id) }, { $set: course })
  }

  static updateCourseData (id, course) {
    return this.courseData.updateOne({ '_id': ObjectID(id) }, { $set: course })
  }

  static updateCourse64 (id, course) {
    return this.courses64.updateOne({ '_id': ObjectID(id) }, { $set: course })
  }

  static filterCourses (filter, sort = { lastmodified: -1 }, skip = 0, limit = 100, random) {
    const query = [{ $match: filter }]
    if (random) query.push({ $sample: { size: limit } })
    query.push({ $sort: Object.assign(sort, sort.stars == null ? { stars: 1 } : {}, sort.title == null ? { title: -1 } : {}) },
      { $limit: skip + limit },
      { $skip: skip })
    return this.courses.aggregate(query)
  }

  static filterCourses64 (filter, sort = { lastmodified: -1 }, skip = 0, limit = 100, random) {
    const query = [{ $match: filter }]
    if (random) query.push({ $sample: { size: limit } })
    query.push({ $sort: Object.assign(sort, sort.stars == null ? { stars: 1 } : {}, sort.title == null ? { title: -1 } : {}) },
      { $limit: skip + limit },
      { $skip: skip })
    return this.courses64.aggregate(query)
  }

  static async getCourseData (id) {
    try {
      const course = (await this.courseData.find({ '_id': ObjectID(id) }).toArray())[0]
      return [course.courseData.buffer, course.courseDataGz.buffer]
    } catch (err) {
      return null
    }
  }

  static async getImage (id, full) {
    try {
      const course = (await this.courseData.find({ '_id': ObjectID(id) }).toArray())[0]
      return full ? course.thumbnail.buffer : course.thumbnailPreview.buffer
    } catch (err) {
      return null
    }
  }

  static async getImage64 (id) {
    try {
      return (await this.courses64.find({ '_id': ObjectID(id) }).toArray())[0].image.buffer
    } catch (err) {
      return null
    }
  }

  static deleteCourse (id) {
    return this.courses.deleteOne({ '_id': ObjectID(id) })
  }

  static deleteCourseData (id) {
    return this.courseData.deleteOne({ '_id': ObjectID(id) })
  }

  static deleteCourse64 (id) {
    return this.courses64.deleteOne({ '_id': ObjectID(id) })
  }

  static async starCourse (courseId, accountId) {
    await this.stars.insertOne({ courseId, accountId })
    const stars = (await this.stars.find({ courseId: ObjectID(courseId) }).toArray()).length
    return this.courses.updateOne({ '_id': ObjectID(courseId) }, { $set: { stars } })
  }

  static async starCourse64 (courseId, accountId) {
    await this.stars64.insertOne({ courseId, accountId })
    const stars = (await this.stars64.find({ courseId: ObjectID(courseId) }).toArray()).length
    return this.courses64.updateOne({ '_id': ObjectID(courseId) }, { $set: { stars } })
  }

  static async unstarCourse (courseId, accountId) {
    await this.stars.deleteOne({ courseId: ObjectID(courseId), accountId: ObjectID(accountId) })
    const stars = (await this.stars.find({ courseId: ObjectID(courseId) }).toArray()).length
    return this.courses.updateOne({ '_id': ObjectID(courseId) }, { $set: { stars } })
  }

  static async unstarCourse64 (courseId, accountId) {
    await this.stars64.deleteOne({ courseId: ObjectID(courseId), accountId: ObjectID(accountId) })
    const stars = (await this.stars64.find({ courseId: ObjectID(courseId) }).toArray()).length
    return this.courses64.updateOne({ '_id': ObjectID(courseId) }, { $set: { stars } })
  }

  static getAccountStars (accountId) {
    return this.stars.find({ accountId: ObjectID(accountId) }).toArray()
  }

  static getAccountStars64 (accountId) {
    return this.stars64.find({ accountId: ObjectID(accountId) }).toArray()
  }

  static async isCourseStarred (courseId, accountId) {
    const length = (await this.stars.find({ courseId: ObjectID(courseId), accountId: ObjectID(accountId) }).toArray()).length
    return length === 1
  }

  static async isCourse64Starred (courseId, accountId) {
    const length = (await this.stars64.find({ courseId: ObjectID(courseId), accountId: ObjectID(accountId) }).toArray()).length
    return length === 1
  }

  static async getCoursesCount () {
    return (await this.courses.stats()).count
  }

  static async getCourses64Count () {
    return (await this.courses64.stats()).count
  }

  static addAccount (account) {
    return this.accounts.insertOne(account)
  }

  static updateAccount (id, account) {
    return this.accounts.updateOne({ '_id': ObjectID(id) }, { $set: account })
  }

  static filterAccounts (filter) {
    return this.accounts.find(filter)
  }

  static async getAccountsCount () {
    return (await this.accounts.stats()).count
  }

  static async getBlogPost (accountId, blogId) {
    const query = Object.assign({ accountId: ObjectID(accountId) },
      blogId ? { _id: ObjectID(blogId) } : { isCurrent: true })
    const blogPost = await this.blog.find(query).toArray()
    if (blogPost.length !== 1) return null
    return blogPost[0]
  }

  static async setBlogPost (accountId, blogPostId, md) {
    let blogPost
    if (!blogPostId) {
      blogPost = await this.blog.find({ accountId: ObjectID(accountId), isCurrent: true }).toArray()
    } else {
      blogPost = await this.blog.find({ accountId: ObjectID(accountId), _id: ObjectID(blogPostId) }).toArray()
    }
    if (!blogPost || blogPost.length !== 1) {
      return (await this.blog.insertOne({ accountId: ObjectID(accountId), md, isCurrent: true })).insertedId
    } else {
      await this.blog.updateOne({ _id: blogPost[0]._id }, { $set: { md } })
      return blogPost[0]._id
    }
  }

  static async addBlogPostImage (blogId, buffer) {
    const jimpImage = await jimp.read(buffer)
    jimpImage.cover(1024, 768)
    const image = await new Promise((resolve, reject) => {
      jimpImage.quality(95)
      jimpImage.getBuffer(jimp.MIME_JPEG, (err, buffer) => {
        if (err) reject(err)
        resolve(buffer)
      })
    })
    return (await this.blogImages.insertOne({ blogId: ObjectID(blogId), image })).insertedId
  }

  // static async getBlogPostImages (id) {
  //   return this.blogImages.find({ blogId: ObjectID(blogId) }).toArray()
  // }

  static getAmazonProducts (country) {
    return this.amazon.find({ country }).toArray()
  }
}
