import React, { Component } from "react";
import { decodeId, NumberInput, SelectInput, TextInput, formatMessage } from "@openimis/fe-core";
import { FormControlLabel, Checkbox, Grid } from "@material-ui/core";
import { fetchLinkedClassList, fetchCalculationParamsList } from "../actions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { Parser } from "hot-formula-parser"
import {
    BOOLEAN_TRUE,
    RIGHT_READ,
    JSON_EXT,
    CALCULATION_RULE,
    OBJECT_FIELD_PATH_REGEX,
    OBJECT_FIELD_PATH_SEPARATOR,
    VARIABLE_NAME_SEPARATOR,
    INPUT_VARIABLE_NAME,
} from "../constants";

class CalculationInput extends Component {
    state = {
        isEntityReady: false,
        fetchedCalculationParamsList: false,
        calculationParamsListRequestLabels: [],
        calculationParamsList: [],
        jsonExtValid: {}
    }

    componentDidMount() {
        this.props.fetchLinkedClassList(this.props.className);
        this.setIsEntityReady();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (
            prevProps.entity !== this.props.entity ||
            prevProps.linkedClassList !== this.props.linkedClassList
        ) {
            this.setIsEntityReady(prevProps);
        } else if (
            !!this.state.isEntityReady &&
            !this.state.fetchedCalculationParamsList
        ) {
            this.getCalculationParamsList();
        } else if (
            prevProps.calculationParamsList !== this.props.calculationParamsList &&
            !!this.props.calculationParamsList.length &&
            !!this.props.calculationParamsListRequestLabel &&
            this.state.calculationParamsListRequestLabels.includes(
                this.props.calculationParamsListRequestLabel
            )
        ) {
            this.setState(
                (_, props) => ({
                    calculationParamsList: props.calculationParamsList,
                }),
                () => !this.props.readOnly && this.setDefaultValue()
            );
        }
        if (
            prevState.jsonExtValid !== this.state.jsonExtValid &&
            !!this.props.setJsonExtValid
        ) {
            const isJsonExtValid = Object.keys(this.state.jsonExtValid)
                .map((key) => this.state.jsonExtValid[key])
                .every((valid) => valid === true);
            this.props.setJsonExtValid(isJsonExtValid);
        }
    }

    setIsEntityReady = (prevProps = null) => {
        let isEntityReady = false;
        let refetchCalculationParamsList = false;
        if (!!this.props.entity && !!this.props.linkedClassList.length) {
            isEntityReady = true;
            this.props.linkedClassList.forEach((linkedClassName) => {
                const linkedClassKey = Object.keys(this.props.entity).find(
                    (k) => k.toLowerCase() === linkedClassName.toLowerCase()
                );
                if (!!this.props.entity[linkedClassKey]) {
                    if (
                        !!prevProps &&
                        !!prevProps.entity &&
                        JSON.stringify(prevProps.entity[linkedClassKey]) !==
                            JSON.stringify(this.props.entity[linkedClassKey])
                    ) {
                        refetchCalculationParamsList = true;
                    }
                } else {
                    isEntityReady = false;
                }
            });
        }
        this.setState(
            refetchCalculationParamsList
                ? { isEntityReady, fetchedCalculationParamsList: false }
                : { isEntityReady }
        );
    }

    getCalculationParamsList = () => {
        const calculationParamsListRequestLabels = [];
        this.props.linkedClassList.forEach((linkedClassName) => {
            const instance = this.props.entity[
                Object.keys(this.props.entity).find((k) => k.toLowerCase() === linkedClassName.toLowerCase())
            ];
            if (!!instance && !!instance.id) {
                let instanceId;
                try {
                    instanceId = decodeId(instance.id);
                } catch (error) {
                    instanceId = instance.id;
                }
                calculationParamsListRequestLabels.push(
                    `${this.props.className}-${linkedClassName}-${instanceId}`
                );
                this.props.fetchCalculationParamsList(
                    this.props.className,
                    linkedClassName,
                    instanceId
                );
            }
        });
        this.setState({
            fetchedCalculationParamsList: true,
            calculationParamsListRequestLabels
        });
    }

    setDefaultValue = () => {
        const defaultValue = !!this.props.value ? JSON.parse(this.props.value) : { [CALCULATION_RULE]: {} };
        if (!defaultValue.hasOwnProperty(CALCULATION_RULE)) {
            defaultValue[CALCULATION_RULE] = {};
        }
        let applyDefaultValue = false;
        this.state.calculationParamsList.forEach((input) => {
            if (!defaultValue[CALCULATION_RULE].hasOwnProperty(input.name)) {
                applyDefaultValue = true;
                switch (input.type) {
                    case "number":
                    case "string":
                        defaultValue[CALCULATION_RULE][input.name] = input.defaultValue;
                        break;
                    case "select":
                        defaultValue[CALCULATION_RULE][input.name] = parseInt(input.defaultValue);
                        break;
                    case "checkbox":
                        defaultValue[CALCULATION_RULE][input.name] = input.defaultValue.toLowerCase() == BOOLEAN_TRUE;
                        break;
                }
            }
        });
        if (applyDefaultValue) {
            this.props.onChange(JSON_EXT, JSON.stringify(defaultValue));
        }
    }

    updateValue = (inputName, inputValue) => {
        const value = !!this.props.value && JSON.parse(this.props.value);
        if (!!value) {
            value[CALCULATION_RULE][inputName] = inputValue;
            this.props.onChange(JSON_EXT, JSON.stringify(value));
        }
    }

    error = (inputName, inputValue, inputCondition) => {
        const parser = new Parser();
        let isValid = true;
        if (!!inputCondition) {
            let condition = inputCondition;
            const objectFieldPaths = condition.match(OBJECT_FIELD_PATH_REGEX);
            if (!!objectFieldPaths) {
                objectFieldPaths.forEach((objectFieldPath) => {
                    const objectFieldPathSplit = objectFieldPath.split(OBJECT_FIELD_PATH_SEPARATOR);
                    objectFieldPathSplit.shift();
                    const variableName = objectFieldPathSplit.join(VARIABLE_NAME_SEPARATOR).toUpperCase();
                    condition = condition.replace(objectFieldPath, variableName);
                    let variableValue = this.props.entity;
                    objectFieldPathSplit.forEach((objectField) => {
                        variableValue =
                            !!variableValue && variableValue[objectField] !== null
                                ? variableValue[objectField]
                                : null;
                    });
                    parser.setVariable(variableName, variableValue);
                });
            }
            parser.setVariable(INPUT_VARIABLE_NAME, inputValue);
            const result = parser.parse(condition);
            isValid = !!result && result.error === null && !!result.result;
        }
        if (this.state.jsonExtValid[inputName] !== isValid) {
            this.setState((state) => ({
                jsonExtValid: {
                    ...state.jsonExtValid,
                    [inputName]: isValid
                }
            }));
        }
        return !isValid && formatMessage(this.props.intl, "calculation", "validationFailed");
    }

    inputs = () => {
        const { intl, rights, requiredRights, readOnly = false } = this.props;
        const { fetchedCalculationParamsList, calculationParamsList } = this.state;
        const inputs = [];
        const value = !!this.props.value
            ? JSON.parse(this.props.value)[CALCULATION_RULE]
            : null;
        fetchedCalculationParamsList &&
            calculationParamsList.forEach((input) => {
                if (
                    !!rights &&
                    !!input.rights &&
                    !!input.rights[RIGHT_READ] &&
                    rights.includes(Number(input.rights[RIGHT_READ]))
                ) {
                    const hasRequiredRights =
                        !!requiredRights &&
                        Array.isArray(requiredRights) &&
                        requiredRights.every((r) => rights.includes(Number(input.rights[r])));
                    if (!!input.relevance && !!value && value.hasOwnProperty(input.name)) {
                        switch (input.type) {
                            case "number":
                                inputs.push(
                                    <NumberInput
                                        key={input.name}
                                        label={input.label[intl.locale]}
                                        value={value[input.name]}
                                        onChange={(v) => this.updateValue(input.name, v)}
                                        readOnly={readOnly || !hasRequiredRights}
                                        error={
                                            !readOnly &&
                                            this.error(input.name, value[input.name], input.condition)
                                        }
                                    />
                                );
                                break;
                            case "checkbox":
                                inputs.push(
                                    <FormControlLabel
                                        key={input.name}
                                        label={input.label[intl.locale]}
                                        control={
                                            <Checkbox
                                                checked={value[input.name]}
                                                onChange={(event) => this.updateValue(input.name, event.target.checked)}
                                                name={input.name}
                                                disabled={readOnly || !hasRequiredRights}
                                                error={
                                                    !readOnly &&
                                                    this.error(input.name, value[input.name], input.condition)
                                                }
                                            />
                                        }
                                    />
                                );
                                break;
                            case "select":
                                const options = [
                                    ...input.optionSet.map((option) => ({
                                        value: parseInt(option.value)? parseInt(option.value) : option.value,
                                        label: option.label[intl.locale]
                                    }))
                                ];
                                inputs.push(
                                    <SelectInput
                                        key={input.name}
                                        label={input.label[intl.locale]}
                                        options={options}
                                        value={value[input.name]}
                                        onChange={(v) => this.updateValue(input.name, v)}
                                        readOnly={readOnly || !hasRequiredRights}
                                        error={
                                            !readOnly &&
                                            this.error(input.name, value[input.name], input.condition)
                                        }
                                    />
                                );
                                break;
                            case "string":
                                inputs.push(
                                    <TextInput
                                        key={input.name}
                                        label={input.label[intl.locale]}
                                        value={value[input.name]}
                                        onChange={(v) => this.updateValue(input.name, v)}
                                        readOnly={readOnly || !hasRequiredRights}
                                        error={
                                            !readOnly &&
                                            this.error(input.name, value[input.name], input.condition)
                                        }
                                    />
                                );
                                break;
                        }
                    }
                }
            });
        return inputs;
    }

    render() {
        return this.inputs().map((input) => (
            <Grid item xs={this.props.gridItemSize} className={this.props.gridItemStyle} key={input.key}>
                {input}
            </Grid>
        ));
    }
}

const mapStateToProps = state => ({
    linkedClassList: state.calculation.linkedClassList,
    calculationParamsList: state.calculation.calculationParamsList,
    calculationParamsListRequestLabel: state.calculation.calculationParamsListRequestLabel,
    rights: !!state.core && !!state.core.user && !!state.core.user.i_user ? state.core.user.i_user.rights : []
});

const mapDispatchToProps = dispatch => {
    return bindActionCreators({ fetchLinkedClassList, fetchCalculationParamsList }, dispatch);
};

export default connect(mapStateToProps, mapDispatchToProps)(CalculationInput);
