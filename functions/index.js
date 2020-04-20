const axios = require("axios")
const get_vdofile = require("./get-vdofile.js").get_vdofile
const list_vdofile = require("./list-vdofile").list_vdofile
const fs = require("fs")
const path = require("path")
const constants = require("./constants")
const { sessionSecret } = constants
const dotenv = require("dotenv")
dotenv.config()
const mysql = require("mysql")
const express = require("express");
const session = require("express-session");
const MySQLStore = require("connect-mysql")(session);
const firebase = require("firebase")
require("firebase/firebase-storage")
const bodyParser = require("body-parser")
const cors = require("cors")
const util = require("util")
const exec = require("child_process").exec
const spawn = require("child_process").spawn
const aync = require("async")
const moment = require("moment-timezone")
const jwt = require("jsonwebtoken")
const sha512 = require("js-sha512")
const app = express()
const server = require("http").createServer(app)
const io = require("socket.io").listen(server)
const image_io = require("socket.io")(process.env.SOCKET_PORT)
const PORT = process.env.PORT
const MAPPICO_ENDPOINT = String(process.env.MAPPICO_ENDPOINT).replace("\\/\\/","//")
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())
const SQLOption = {
    config: {

        host: process.env.SESSION_SQL_HOST,
        user: process.env.SESSION_SQL_USER,
        password: process.env.SESSION_SQL_PASSWORD,
        database: process.env.SESSION_SQL_DATABASE
    }
}
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    // store: new MySQLStore(SQLOption),
    cookie: {
        maxAge: 1000 * 3600 * 24 * 365
    },
}))
app.use(cors());

// Connection to MySQL Server (PRODUCTION)
const connection = mysql.createConnection({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE
});
const { firebaseConfig } = constants
// initialize firebase app
firebase.initializeApp(firebaseConfig);
// references to database
var databaseRef = firebase.database().ref()
var newFaceRef = databaseRef.child("face")
var notificationRef = databaseRef.child("notification")
var userRef = databaseRef.child("user")
var loginRef = databaseRef.child("login")
var locationRef = databaseRef.child("location")
var tripRef = databaseRef.child("trip")
var userTripsRef = databaseRef.child("usertrips")
var gasRef = databaseRef.child("gaslevel")

// reference  to storage
var storageRef = firebase.storage().ref()


io.on("connection", (socket) => {
    console.log("client connected ...")
     socket.on("obd_update_data",data=>{
    	let {uid} =data
            io.emit(`trip_update_${uid}`,data) // send data to middle server                                                                                                                                                                                                                                                         // push new data into firebase server...                                                                                                                                                                                                                                                                                     trip.set({
    })
    socket.on("livestream",data=>{
	let {uid} = data
	console.log("Livestream Image ...")
    	image_io.emit(`live_stream_${uid}`, data)
    })
    socket.on("disconnect", () => {
        console.log("socket disconnected ...")
    })
    socket.on("connect", () => {
        console.log("socket connected ...")
    })
    // ON FACE FOUND EVENT
    socket.on("face_found", async data => {
        console.log("[INFO] face found event triggered ... ")
        let { uid, expoPushToken, b64img } = data
        b64img = String(b64img)
        let tokenIsOk = await checkUserActiveToken(uid)
        if (tokenIsOk) {
            title = "Unknown Face Detected!!"
            message = `Detected at ${moment().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm:ss")}`
            pushNotification(title, message, expoPushToken)
        }
        let faceStorage = storageRef.child("driver/face")
        try {
            console.log(b64img)
            let task = faceStorage.putString(b64img)
            task.on("state_changed",
                snapshot => { }, // DO NOTHING
                err => { console.log(err) }, // DO NOTHING
                () => {
                    task.snapshot.ref.getDownloadURL().then(url => {
                        // insert data to firebase database
                        newFaceRef.child(uid).push().set({
                            url,
                            read: false,
                            timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
                        })
                    })
                }
            )
        } catch (err) { console.log(err) }


    })
})

const checkUserActiveToken = async (uid) => {
    let isOk = true
    await loginRef.child(`${uid}/app`).orderByKey().limitToLast(1).once("child_added", snapshot => {
        let data = snapshot.val()
        if (!data) isOk = false
        let { status } = data
        if (status == "expired") isOk = false
    })
    return isOk
}

const pushNotification = async (title, message, token) => {
    let messages = []
    messages.push({
        to: token,
        title: title,
        body: message,
        sound: "default"
    })
    let response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
            "Accept-Encoding": "gzip, deflate",
            "Host": "exp.host",
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(messages)
    })
    return response
}

app.post("/api/v1/user/register", (req, res) => {
    const {
        fname,
        lname,
        email,
        password,
        mobile
    } = req.body

    userRef.orderByChild("email").equalTo(email).once("value", (snapshot) => {
        let matched_user = snapshot.val()
        if (!matched_user) {
            userRef.push().set({
                fname: fname,
                lname: lname,
                password: password,
                mobile: mobile,
                email: email,
                regisdate: moment().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm:ss")
            }, (err) => {
                if (err) return res.json({ code: 400, message: "unable to register this user" })
                else return res.json({ code: 200, message: "successfully registered user" })
            })
        } else {
            return res.json({
                code: 410,
                message: "This email has been taken"
            })
        }
    })
})


// HANDLE USER LOG OUT
app.post("/api/v1/user/logout", (req, res) => {
    const { token } = req.headers
    const { uid, from } = req.body
    console.log(token)
    console.log(uid, from)
    loginRef.child(`${uid}/${from}`).orderByChild("token").equalTo(token).once("value", snapshot => {
        //
        let key = null
        // SET KEY
        Object.keys(snapshot.val()).map(_key => {
            return (key = _key)
        })
        loginRef.child(`${uid}/${from}/${key}`).update({
            status: "expired"
        }, (err) => {
            if (err) return res.json({ code: 500, message: "Unable destroy your token" })
            else return res.json({ code: 200, message: "logout successfully" })
        })


    })
})
// HANDLE USER LOG IN
app.post("/api/v1/user/login", (req, res) => {
    const { username, password, from } = req.body
    // If inputs are not all filled
    if (!username || !password || !from) {
        return res.json({ code: 500, message: "Invalid inputs; please check your payload inputs " })
    }
    userRef.orderByChild("email").equalTo(username).once("value", (snapshot) => {
        let result = snapshot.val()
        if (result && password && from) {
            let user = null
            let uid = null
            matched = Object.keys(result).find(key => {
                user = result[key]
                uid = key
                return user.password === password
            })
            if (matched) {
                result = result[uid]
                result["from"] = from
                result["uid"] = uid
                delete result["password"] // delete password
                let token = jwt.sign({ ...result, timestamp: new Date().toString() }, 'shhhhh');
                result["token"] = token
                loginRef.child(uid).child(from).push().set({
                    token: token,
                    from: from,
                    logindate: moment().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm:ss"),
                    status: "active"
                }, (err) => {
                    if (err) return res.json({ code: 400, message: "failed to authenticate to server due to network connection" })
                    else {

                        return ([
                            res.json({
                                code: 200,
                                message: "successfully authenticated to server . . .", userInfo: result
                            })
                        ])
                    }
                })
            } else {
                return res.json({ code: 420, message: "failed to authenticate to server.." })
            }
        } else {
            return res.json({ code: 410, message: "Input error check; check you email or password" })
        }
    })
})



app.post("/api/v1/user/getrecord", (req, res) => {
    const { user_id, from } = req.body
    const { token } = req.header
    var ref = loginRef.child(user_id).child(from).orderByKey().limitToLast(1)
    ref.once("value", (snapshot) => {
        // console.log("TEST NAJA :",snapshot.val())
        if (snapshot.val()) {
            let loginInfo = null
            Object.keys(snapshot.val()).map(key => {
                loginInfo = snapshot.val()[key]
            })
            let latestToken = loginInfo[token]
            // If token isnt expired
            if (latestToken === token) {
                const resultRef = notificationRef.child(user_id).orderByKey()
                resultRef.once("value", (snapshot) => {
                    if (snapshot.val()) {
                        var arrayOfRecord = Object.values(snapshot.val()).reverse()
                        return res.json({ code: 200, result: arrayOfRecord })
                    } else {
                        console.log(snapshot.val())
                        return res.json({ code: 200, result: [] })
                    }
                })
            } else {
                return res.json({ code: 400, message: "Your token is expired" })
            }
        } else {
            return res.json({ code: 500, message: "No collection found" })
        }
    })

})


// PUSH NOTIFICATION
app.post("/api/v1/notify", (req, res) => {
    const { user_id, event, token } = req.body
    var notification = notificationRef.child(`${user_id}`).push()
    var id = notification.key
    notification.set({
        id,
        ...req.body,
        timestamp: moment().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm:ss"),
        read: false
    }, (err) => {
        if (err) return res.json({ code: 500, message: "Failed to push notification" })
        else {
            let title = `Event "${event}" has occured. Let's check it out!`
            let message = `Occured at ${moment().tz("Asia/Bangkok").format("YYYY/MM/DD HH:mm:ss")}`
            let fetched = pushNotification(title, message, token)
            fetched.then(response => response.json()).then(response => {
                let { data } = response
                let { status } = data[0]
                if (status === "ok") {
                    return res.json({ code: 200, message: "Successfully push notification" })
                } else {
                    return res.json({ code: 500, message: "Failed to push notification" })
                }
            })
        }
    })
})

app.post("/api/v1/update/location", (req, res) => {
    const { uid, lat, lng } = req.body
    let userLocation = locationRef.child(uid).push()
    userLocation.set({
        lat: lat,
        lng: lng
    }, err => {
        if (err)
            return res.json({ code: 500, message: "Unable to push current location of the user" })
        else
            return res.json({ code: 200, message: "Successfully update user current location" })
    }
    )
})

app.post("/api/v1/update/gas", (req, res) => {
    const { uid, co } = req.body
    let userGas = gasRef.child(uid).push()
    userGas.set({
        co: co
    }, err => {
        if (err)
            return res.json({ code: 500, message: "Unable to push current gas level of the user" })
        else
            return res.json({ code: 200, message: "Successfully update user current gas" })
    }
    )
})


app.post("/api/v1/getalltrips", (req, res) => {
    const { uid, from } = req.body
    const { token: userToken } = req.headers
    const userRef = loginRef.child(`${uid}/${from}`).orderByKey().limitToLast(1)
    userRef.once("value", snapshot => {
        let latestLogin = snapshot.val()
        let loginInfo = null
        Object.keys(latestLogin).map(key => {
            loginInfo = latestLogin[key]
        })
        let { token: latestToken } = loginInfo
        // console.log(loginInfo)
        if (userToken == latestToken) {
            let trips = userTripsRef.child(uid)
            trips.once("value", tripSnapshot => {
                let alltrips = tripSnapshot.val()
                return res.json({ code: 200, trips: alltrips, message: "successfully request user all trips" })
            })
        } else {
            return res.json({ code: 400, message: "Invalid token", token1: userToken, token2: latestToken })
        }
    })
})

app.post("/api/v1/gettripdata", (req, res) => {
    const { uid, from, acctime } = req.body
    const { token: userToken } = req.headers
    const userRef = loginRef.child(`${uid}/${from}`).orderByKey().limitToLast(1)
    userRef.once("value", snapshot => {
        let latestLogin = snapshot.val()
        let loginInfo = null
        Object.keys(latestLogin).map(key => {
            loginInfo = latestLogin[key]
        })
        let { token: latestToken } = loginInfo
        console.log(loginInfo)
        if (userToken === latestToken) {
            let trip = tripRef.child(`${uid}/${acctime}`)
            trip.once("value", tripSnapshot => {
                let tripData = tripSnapshot.val()
                return res.json({ code: 200, tripdata: tripData, message: "successfully request trip data" })
            })
        } else {
            return res.json({ code: 400, message: "Invalid token" })
        }
    })
})

// return list of user's video
app.post("/api/v1/get/vdo",async(req,res)=>{
    const {uid} = req.body
    try{
        let vdo = list_vdofile(uid)
        return res.json({code:200,vdo})
    }catch(err){res.json({code:500,err})}
})

//Stream VDO file to client device
app.get("/api/v1/get/vdostream/:uid/:file",(req,res)=>{
        try{
	console.log("this is request params : ",req.params)
    	let {uid,file} =req.params
        let vdo_file = path.join(process.env.VDO_TRIP_DIR,`${uid}_${file}`)
        let stat = fs.statSync(vdo_file)
        let fileSize = stat.size
        const range = req.headers.range
	if (range) {
        console.log("CASE VDO STREAM")
        console.log("RANGE",range)
	    const parts = range.replace(/bytes=/, "").split("-")
	    const start = parseInt(parts[0], 10)
	    const end = parts[1] 
	      ? parseInt(parts[1], 10)
	      : fileSize-1
	    const chunksize = (end-start)+1
	    const file = fs.createReadStream(vdo_file, {start, end})
	    const head = {
	      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
	      'Accept-Ranges': 'bytes',
	      'Content-Length': chunksize,
	      'Content-Type': 'video/mp4',
	    }
	    res.writeHead(206, head);
	    file.pipe(res);
   	  } else {
        console.log("CASE DOWNLOAD ENTIRE VDO FILE")
   	    const head = {
	      'Content-Length': fileSize,
	      'Content-Type': 'video/mp4',
	    }
	    res.writeHead(200, head)
	    fs.createReadStream(vdo_file).pipe(res)
	  }
	}catch(err){
		return res.json({code:500,message:"failed to stream vdo file",err})
	}

})


app.post("/api/v1/server/download/file",(req,res)=>{
    const {uid,file} = req.body
    let vdo_file = path.join(process.env.VDO_TRIP_DIR,`${uid}_${file}`)
    if (fs.existsSync(vdo_file)){
        return res.json({code:200,message:"the file is already exist; no need to download"})
    }else{
        get_vdofile(uid,file,()=>{
	    console.log("successfully download file")
            return res.json ({code:200,message:"successfully download file"})
        })
    }
})


server.listen(PORT, () => {
    console.log("Listening at port " + PORT)
})

