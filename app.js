const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//API 1---->User Login
//get JWT token using jsonwebtoken package
//const JWTToken = jwt.sign(payload,'own_secret_key');
//payload is user information
//Scenario 1 Invalid user
//Scenario 2 Invalid password
//Scenario 3 Return the JWT Token

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  //check user
  const userDetailsQuery = `SELECT * FROM user
                              WHERE username='${username}';`;
  const userDetails = await database.get(userDetailsQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user"); //scenario 1
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched === true) {
      //get JWT Token
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "shan_secret_key");
      response.send({ jwtToken }); //scenario 3
    } else {
      response.status(400);
      response.send("Invalid password"); //scenario 2
    }
  }
});

//Authentication with Token
//scenario 1 If the token is not provided by the user or an invalid token
//scenario 2 After successful verification of token proceed to next middleware or handler
//get JWT token from headers and validate using jwt.verify
//jwt.verify(jwtToken , 'secret key given above' , callback function)

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token"); //scenario 1
  } else {
    jwt.verify(jwtToken, "shan_secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token"); //scenario 1
      } else {
        next(); //scenario 2
      }
    });
  }
}

//API 2
//Returns a list of all states in the state table
//get the results if the user has authentication

const convertStateDbObject = (objectItem) => {
  return {
    stateId: objectItem.state_id,
    stateName: objectItem.state_name,
    population: objectItem.population,
  };
};

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state;`;
  const getStates = await database.all(getStatesQuery);
  response.send(getStates.map((eachState) => convertStateDbObject(eachState)));
});

//API 3
//Returns a state based on the state ID
//only authenticated users get the details

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDetailsQuery = `SELECT * FROM state
                                   WHERE state_id=${stateId};`;
  const getStateDetails = await database.get(getStateDetailsQuery);
  response.send(convertStateDbObject(getStateDetails));
});

//API 4
//Create a district in the district table, district_id is auto-incremented
//only authenticated users can post the data

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `INSERT INTO district
                                 (district_name,state_id,cases,cured,active,deaths)
                                 VALUES('${districtName}',
                                         ${stateId},
                                         ${cases},
                                         ${cured},
                                         ${active},
                                         ${deaths});`;
  const createDistrict = await database.run(createDistrictQuery);
  response.send("District Successfully Added");
});

//API 5
//Returns a district based on the district ID

const convertDbObjectDistrict = (objectItem) => {
  return {
    districtId: objectItem.district_id,
    districtName: objectItem.district_name,
    stateId: objectItem.state_id,
    cases: objectItem.cases,
    cured: objectItem.cured,
    active: objectItem.active,
    deaths: objectItem.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictByIdQuery = `SELECT * FROM district
                                   WHERE district_id=${districtId};`;
    const getDistrictByIdQueryResponse = await database.get(
      getDistrictByIdQuery
    );
    response.send(convertDbObjectDistrict(getDistrictByIdQueryResponse));
  }
);

//API 6
//Deletes a district from the district table based on the district ID

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district
                                 WHERE district_id=${districtId};`;
    const deleteDistrict = await database.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//API 7
//Updates the details of a specific district based on the district ID
//only authenticated users can update the data

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `UPDATE district
                                  SET district_name='${districtName}',
                                       state_id=${stateId},
                                       cases=${cases},
                                       cured=${cured},
                                       active=${active},
                                       deaths=${deaths}
                                  WHERE district_id=${districtId};`;
    const updateDistrictQueryResponse = await database.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//API 8
//Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateByIdStatsQuery = `SELECT SUM(cases) AS totalCases,
                                            SUM(cured) AS totalCured,
                                            SUM(active) AS totalActive,
                                            SUM(deaths) AS totalDeaths
                                    FROM district 
                                    WHERE state_id=${stateId};`;
    const getStateByIdStatsQueryResponse = await database.get(
      getStateByIdStatsQuery
    );
    response.send(getStateByIdStatsQueryResponse);
  }
);

module.exports = app;
