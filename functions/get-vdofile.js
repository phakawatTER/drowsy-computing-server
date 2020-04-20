const axios = require("axios")
const fs = require("fs")
const dotenv = require("dotenv")
dotenv.config()
const MAPPICO_FILE_ENDPOINT = process.env.MAPPICO_FILE_ENDPOINT.replace("\\/\\/","//")
const test_uid =  "-LrdlygY0H5IzMvDo-bh";
const test_filename = "1585057976.mp4";
const get_vdofile = (uid,filename,callback) => {
	let get = axios({method:"get",responseType:"stream",url:MAPPICO_FILE_ENDPOINT + `/${uid}/${filename}`})
	.then(res=>{
		const vdo_path = `${process.env.VDO_TRIP_DIR}/${uid}_${filename}`
		res.data.pipe(fs.createWriteStream(vdo_path).on("finish",()=>{
			callback()
		}))
	}).catch(err=>{console.log(err)})
}
module.exports.get_vdofile = get_vdofile 

// get_vdofile (test_uid,test_filename,()=>{console.log("FINSIHED")})

