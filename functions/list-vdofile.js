const fs = require("fs")
const dotenv = require("dotenv")
dotenv.config()
const list_vdofile = (uid) =>{
    let all_files = fs.readdirSync(process.env.VDO_TRIP_DIR)
    user_files = all_files.map(file=>{
        if(file.includes(file)){
            let prefix = `${uid}_`
            res = file.replace(prefix,"")
            console.log(res)
            return res
        }
    })
    return  user_files
}
//console.log(list_vdofile("-LrdlygY0H5IzMvDo-bh"))
module.exports.list_vdofile = list_vdofile

