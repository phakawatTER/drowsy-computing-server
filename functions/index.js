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
const Blob = require("node-blob")
const app = express()
const server = require("http").createServer(app)
const io = require("socket.io").listen(server)
const middle_io = require("socket.io-client")(process.env.MIDDLE_SERVER_SOCKET) // CONNECT TO MIDDLE SERVER SOCKET FOR IMAGE STREAMING
const PYTHON_SCRIPT_PATH =  "/home/phakawat/imageprocessing/processimage2.py"
const LANDMARK_MODEL_PATH = "/home/phakawat/models/c5.h5"

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 3600 * 24 * 365 // 1000 years token expire
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
    socket.on("send_image", (data) => {
        let { jpg_text, uid } = data
        delete data["jpg_text"]
        io.emit(`image_${uid}`, { jpg_text: String(jpg_text), ...data })
        //image_io.emit(`live_stream_${uid}`, { jpg_text: String(jpg_text), ...data })
    })
    socket.on("disconnect", () => {
        console.log("socket disconnected ...")
    })
    socket.on("connect", () => {
        console.log("socket connected ...")
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


//  generate acctime for trip and strart python process to process streamed image from jetson nano board
app.post("/api/v1/createtrip", async (req, res) => {
    const { uid, token, pushToken } = req.body
    const acctime = moment(new Date()).unix().toString() // UNIX TIME
    const userTrips = userTripsRef.child(uid).push()
    const tokenIsOk = await checkUserActiveToken(uid)
    userTrips.set({
        acctime: acctime
    }, err => {
        if (err) return res.json({ code: 500, message: "Failed to create trip", err })
        else {
            let title = `New trip has started. Let's check it out!`
            let message = `Trip start at ${moment().tz("Asia/Bangkok").format("YYYY/MM/DD HH:mm:ss")}`
            try {
                let python_process = spawn("/home/bipul/anaconda3/envs/tf_gpu/bin/python", [PYTHON_SCRIPT_PATH,
                    `-u`, ` ${uid}`,
                    `-a`, acctime,
                    `-t`, token,
                    `-x`, pushToken,
                    '--landmark-model', LANDMARK_MODEL_PATH
                ])
		console.log(`python ${PYTHON_SCRIPT_PATH} -u " ${uid}" -a ${acctime} -t ${token} -x " ${pushToken}" --landmark-model ${LANDMARK_MODEL_PATH}`)
                let _data = {}
                let user_id = ""
                let frame_sender = setInterval(() => {
                    if (user_id == "") return
                    console.log("FRAME SENT ...", user_id)
                    middle_io.emit(`livestream`, _data)
                }, 80)

                python_process.stdout.on("data", data => {
		    data = String(data) //parse string from bytes
		    console.log(data.length)
                    try {
                        data = (data).split("__END__")[0]
                        data = JSON.parse(data)
                        let { uid } = data
                        _data = data
                        user_id = uid
                    } catch (err) {
		    }
                })
                python_process.stdout.on("end", data => {
                    clearInterval(frame_sender)
                    console.log("Trip ended")
                })
                if (tokenIsOk) {
                    let fetched = pushNotification(title, message, pushToken)
                    fetched.then(response => response.json()).then(response => {
                        let { data } = response
                        let { status } = data[0]
                        return ([
                            res.json({ acctime: acctime, code: 200, message: "Successfully get acctime" }),
                        ])
                    }).catch(err => {
                        return res.json({ code: 500, message: "Failed to create trip", err })
                    })
                } else {
                    return ([
                        res.json({ acctime: acctime, code: 200, message: "Successfully get acctime" }),
                    ])
                }
            } catch (err) {
                console.log(err)
                return res.json({ code: 500, message: "Failed to create trip", err })
            }
        }
    })
})

server.listen(process.env.PORT, () => {
    console.log("Listening at port " + process.env.PORT)
})
