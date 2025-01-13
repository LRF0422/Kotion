const colors = [
  "#47A1FF",
  "#59CB74",
  "#FFB952",
  "#FC6980",
  "#6367EC",
  "#DA65CC",
  "#FBD54A",
  "#ADDF84",
  "#6CD3FF",
  "#659AEC",
  "#9F8CF1",
  "#ED8CCE",
  "#A2E5FF",
  "#4DCCCB",
  "#F79452",
  "#84E0BE",
  "#5982F6",
  "#E37474",
  "#3FDDC7",
  "#9861E5"
];

const total = colors.length;

export const getUserColor = () => colors[~~(Math.random() * total)];


export const getTitleContent = (value: any) => {
  if (value && value.content) {
    const content = value.content[0]

    if (content.content) {
      if (content.content[0].content) {
        const res = content.content[0].content[0].text
        return res
      }
      return null;
    }
  }
  return null
}

const getIcon = (value: any) => {
  if (value) {
    const content = value.content[0]
    console.log('content', content);

    if (content) {
      return content.attrs?.icon
    }
  }
  return null
}
