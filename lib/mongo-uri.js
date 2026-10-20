export function getMongoUri(environment = process.env) {
  return environment.MONGODB_URI || environment.MONGO_URI || "";
}
