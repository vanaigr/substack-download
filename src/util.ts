
export function getPostData(values: any) {
    let html: string | undefined
    let videoUpload: any

    try {
        if(!html) {
            html = values.feedData.initialPost.post.body_html
            videoUpload = values.feedData.initialPost.post.videoUpload
        }
    }
    catch(err) {}

    try {
        if(!html) {
            html = values.post.body_html
            videoUpload = values.post.videoUpload
        }
    }
    catch(err) {}

    return { html, videoUpload }
}
